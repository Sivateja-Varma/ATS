from fastapi import FastAPI,status,HTTPException,Form,UploadFile,File,Depends
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from contextlib import asynccontextmanager
from Shared.finalToken import RoleCheck
import aiohttp
from pydantic import BaseModel,Field as PydanticField
from typing import Annotated,List
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.runnables import RunnablePassthrough
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate,MessagesPlaceholder
from langchain_classic.chains.retrieval import create_retrieval_chain
from langchain_core.output_parsers import ListOutputParser
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings,ChatOllama
from .models import Seeker,SeekerPublic,SeekerCreation
from .db import SessionDep
from sqlmodel import select,String,cast
import os
from dotenv import load_dotenv
load_dotenv()
os.makedirs("Resumes",exist_ok=True)

class ExtractedSkills(BaseModel):
    skills: List[str] = PydanticField(description="List of technical keywords extracted from the resume, in lowercase.")

@asynccontextmanager
async def lifespan(app:FastAPI):
  basellm=ChatOllama(model='gemma2:2b')
  app.state.llm=basellm.with_structured_output(ExtractedSkills)
  app.state.messageSesh=aiohttp.ClientSession()
  yield
  app.state.llm=None
  await app.state.messageSesh.close()



app=FastAPI(title="User Service",summary='provides all the features related to seekers',lifespan=lifespan)

app.mount("/Resumes",StaticFiles(directory="Resumes"),name="Resume")

@app.get('/health-check',status_code=status.HTTP_200_OK,summary='Check if the service is live')
async def healthCheck():
  return {"service":"seeker_service","status":"live"}

@app.get('/seekers',summary='endpoint to get all registered seekers on the platform',description='all job seekers')
def allSeekers(session:SessionDep,search:str|None=None):
  if search is not None:
     seekers=session.exec(select(Seeker).where(cast(Seeker.strengths, String).contains(search))
        ).fetchall()
     return seekers 
  seekers=session.exec(select(Seeker)).all()
  storage=[{"id":seeker.id,"name":seeker.name,"strengths":seeker.strengths,"resume_path":f"{os.getenv("LOCAL_PATH")}{seeker.resume_path}","user_id":seeker.user_id,"email":seeker.email} for seeker in seekers]
  return storage

@app.get('/seeker',summary='endpoint to get one specific registered seeker on the platform',description='specific registered seeker based on id')
def oneSeeker(session:SessionDep,id:int):

  seeker=session.get(Seeker,id)  #does not raise an error if not found
  if seeker is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="user not found")
  full_resume_path = f"{os.getenv('LOCAL_PATH')}{seeker.resume_path}" if seeker.resume_path else None
  return {"id":seeker.id,"name":seeker.name,"strengths":seeker.strengths,"resume_path":F"{full_resume_path}"}

@app.get('/authSeeker',summary='endpoint to get one specific registered seeker on the platform',description='specific registered seeker based on id')
def authSeeker(session:SessionDep,id:int):

  seeker=session.exec(select(Seeker).where(Seeker.user_id == id)).first()  #does not raise an error if not found
  if seeker is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="user not found")
  return {"id":seeker.id,"name":seeker.name,"strengths":seeker.strengths,"resume_path":f"{os.getenv("LOCAL_PATH")}{seeker.resume_path}"}

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

@app.post('/registerSeeker',summary='endpoint to create user',description='resume can be added after creation')
async def createSeeker(session:SessionDep,resume:UploadFile=File(None),user:dict=Depends(RoleCheck(['seeker']))):
  # try:
  path = None
  strengths = []
  structured_data = None
  if resume:
    path=F"Resumes/{resume.filename}"
    with open(path,'wb') as f:
      f.write(await resume.read())
    loader=PyPDFLoader(path)
    docs=loader.load()
    splitter=RecursiveCharacterTextSplitter(chunk_size=300,chunk_overlap=30)
    splits=splitter.split_documents(docs)
    embedding=OllamaEmbeddings(model='mxbai-embed-large:latest')

    db=FAISS.from_documents(splits,embedding)
    print('i am here')
    ret=db.as_retriever(k=10)
    template=ChatPromptTemplate.from_messages(
    [('system','do not hallucinate and only use the {context} as ur sole knowledge base and the main task is to parse the given documents and extract technical keywords from the resume docs example list ["java","python","javascript"], even if u find anything remotely similar to these words for example reactjs is react and react is reactjs capital or small letter doesnt matter but the final words parsed should all be small and also look for sections like "Technical Skills" or "Tech Stack" which already has all the skills listed'),
    ("user","{input}")]
    )
    print('i am here2')
    chain = (
            {"context": ret | format_docs, "input": RunnablePassthrough()}
            | template
            | app.state.llm
        )
    structured_data: ExtractedSkills = chain.invoke("Extract all technical skills, including programming languages, frameworks, libraries, databases, cloud platforms, DevOps tools, and version control systems.")
    #always look close on the input and prompt every word, do not change anything unless this is done clearly    
    if structured_data and hasattr(structured_data, 'skills'):
        strengths = structured_data.skills

  seeker=Seeker(name=user.get('name'),email=user.get('email'),user_id=user.get('id'),strengths=strengths,resume_path=path) 
  def Save():
    session.add(seeker)
    session.commit()
    session.refresh(seeker)
  await run_in_threadpool(Save)  
  return seeker 
  # except:
  #   raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="something went wrong try again")

  # start the update for the resume and the workflow should be copied or not and also as of now the latest resume is given everything else is out of scope 

@app.put('/updateResume',summary="endpoint to update the resume",description="update the current resume with the latest one")
async def updateResume(session:SessionDep,resume:UploadFile=File(None),user:dict=Depends(RoleCheck(['seeker']))):
  person = session.exec(select(Seeker).where(Seeker.user_id==user.get('id'))).first()
  if person is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="User not found")
  if resume is not None:
    if os.path.exists(person.resume_path):
      os.remove(person.resume_path)
      path = None
      strengths = []
      structured_data = None
      path=F"Resumes/{resume.filename}"
      with open(path,'wb') as f:
        f.write(await resume.read())
      loader=PyPDFLoader(path)
      docs=loader.load()
      splitter=RecursiveCharacterTextSplitter(chunk_size=300,chunk_overlap=30)
      splits=splitter.split_documents(docs)
      embedding=OllamaEmbeddings(model='mxbai-embed-large:latest')

      db=FAISS.from_documents(splits,embedding)
      print('i am here')
      ret=db.as_retriever(k=10)
      template=ChatPromptTemplate.from_messages(
      [('system','do not hallucinate and only use the {context} as ur sole knowledge base and the main task is to parse the given documents and extract technical keywords from the resume docs example list ["java","python","javascript"], even if u find anything remotely similar to these words for example reactjs is react and react is reactjs capital or small letter doesnt matter but the final words parsed should all be small and also look for sections like "Technical Skills" or "Tech Stack" which already has all the skills listed'),
      ("user","{input}")]
      )
      print('i am here2')
      chain = (
      {"context": ret | format_docs, "input": RunnablePassthrough()}
      | template
      | app.state.llm
      )
      structured_data: ExtractedSkills = chain.invoke("Extract all technical skills, including programming languages, frameworks, libraries, databases, cloud platforms, DevOps tools, and version control systems and also everything in the technical skills block.")
      #always look close on the input and prompt every word, do not change anything unless this is done clearly    
      if structured_data and hasattr(structured_data, 'skills'):
        strengths = structured_data.skills
      person.resume_path=path
      person.strengths=strengths
      def Save():
          session.commit()
          session.refresh(person)
      await run_in_threadpool(Save)  
      return person

# update the user details other than resume.


#start top recommended jobs based on the strengths and the key word match of the score to the seekers 


#initial plan -> for deletion there should be two way check that is for a seeker to delete there must be no active applications and the seeker should be deleted first and after the user in the main auth service, as if not i should figure out a way to deal with orphan seekers with no user_id which is not my concern as of now ,so two way check it is !

# now -> Enterprise platforms almost never use hard deletes for profiles that have application history. Instead, they use a process called Anonymisation (or Pseudonymisation).

#this endpoint shouldnt call the all applications endpoint for the active application check as that endpoint will later be used by candidates to see their active applications and i plan to create a new endpoint in the application service for this check
@app.delete('/deleteSeeker',summary="delete ur profile",description="endpoint to delete a seeker profile, only if there is no active application")
async def deleteSeeker(session:SessionDep,user:dict=Depends(RoleCheck(['seeker']))):
  chap=session.exec(select(Seeker).where(Seeker.user_id==user.get('id'))).first()
  if chap is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="user not found")
  async with app.state.messageSesh.get('http://127.0.0.1:8002/checkBulk',params={"cand_id":chap.id}) as resp:
    application=await resp.json()
  if application:
    raise HTTPException(status_code=status.HTTP_406_NOT_ACCEPTABLE,detail="cannot delete profile when a application is active") 
  async with app.state.messageSesh.put('http://127.0.0.1:8002/statusWithdrawerBulk',params={"cand_id":chap.id}) as resp:
      green=await resp.json()
  async with app.state.messageSesh.delete('http://127.0.0.1:8003/deleteUser',params={'id':chap.user_id}) as resp:
      if resp.status != 200:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,detail="operation failed") 
  if green:
    if chap.resume_path is not None:
      if os.path.exists(chap.resume_path):
        os.remove(chap.resume_path)
    chap.email=F"anonymous{chap.id}@gmail.com"
    chap.resume_path=None
    chap.user_id=None
    chap.strengths=[]    
    chap.name="anonymous"
    def Save():
      session.commit()
      return "Resume has been deleted , can now delete your main profile with us."
    await run_in_threadpool(Save)

# single application withdrawal
@app.put('/withdraw',summary="endpoint to with draw an application",description="withdraw an application based on application id")
async def appWithdraw(session:SessionDep,app_id:int,user:dict=Depends(RoleCheck(['seeker']))):
  seeker=session.exec(select(Seeker).where(Seeker.user_id==user.get('id'))).first()
  if not seeker:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="seeker profile not found,first create a seeker profile with your resume to access this service")
  async with app.state.messageSesh.get('http://127.0.0.1:8002/application',params={"id":app_id}) as resp:
    body=await resp.json()
  if body.get('cand_id') != seeker.id:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="you are only allowed to with draw your application, not your peers.")
  async with app.state.messageSesh.put("http://127.0.0.1:8002/statusWithdrawerSingle",params={"id":app_id}) as resp:
    response_data = await resp.json()
        
    if resp.status != 200:
          
      error_detail = response_data.get('detail', 'An error occurred during application processing.')
      raise HTTPException(status_code=resp.status, detail=error_detail)
            
    reply = response_data

  return reply  


  
  


