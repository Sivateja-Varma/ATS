from fastapi import FastAPI,status,HTTPException,Form,UploadFile,File
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from contextlib import asynccontextmanager
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
  yield
  app.state.llm=None



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
  storage=[{"id":seeker.id,"name":seeker.name,"strengths":seeker.strengths,"resume_path":f"{os.getenv("LOCAL_PATH")}{seeker.resume_path}"} for seeker in seekers]
  return storage

@app.get('/seeker',summary='endpoint to get one specific registered seeker on the platform',description='specific registered seeker based on id')
def oneSeeker(session:SessionDep,id:int):

  seeker=session.get(Seeker,id)  #does not raise an error if not found
  if seeker is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="user not found")
  return {"id":seeker.id,"name":seeker.name,"strengths":seeker.strengths,"resume_path":f"{os.getenv("LOCAL_PATH")}{seeker.resume_path}"}

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

@app.post('/registerSeeker',summary='endpoint to create user',description='resume can be added after creation')
async def createSeeker(info:Annotated[str|None,Form(...)],session:SessionDep,resume:UploadFile=File(None)):
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
    ret=db.as_retriever()
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
    structured_data: ExtractedSkills = chain.invoke("Extract all technical programming languages and frameworks.")
        
    if structured_data and hasattr(structured_data, 'skills'):
        strengths = structured_data.skills

  seeker=Seeker(name=info,strengths=strengths,resume_path=path) 
  def Save():
    session.add(seeker)
    session.commit()
    session.refresh(seeker)
  await run_in_threadpool(Save)  
  return seeker 
  # except:
  #   raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="something went wrong try again")
