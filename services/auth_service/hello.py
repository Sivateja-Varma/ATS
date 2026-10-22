from fastapi import FastAPI,status,HTTPException
from .models import User,UserPublic,RegUSer,UserReq,LoginModel
from .db import SessionDep
from typing import List
from sqlmodel import SQLModel,select
from .helper import hashingFunc,verifyFunc,tokenizeFunc


app=FastAPI(title="Auth Service",summary="consolidated Auth service for the entire application",docs_url="/docs")


@app.get('/health-check',status_code=status.HTTP_200_OK)
async def healthCheck():
  return {"service":"Auth","status":"live"}

@app.get('/users',status_code=status.HTTP_200_OK,response_model=List[UserPublic])
def allUsers(session:SessionDep):
  users=session.exec(select(User)).all()
  return users

@app.post('/register',summary="endpoint to register user",description="A consolidated user endpoint creator function, all the workflow starts from here when it comes to user",response_model=UserPublic)
def userRegister(chap:RegUSer,session:SessionDep):
  try:
    user = User(
      email=chap.email,
      name=chap.name,
      user_pass=hashingFunc(chap.user_pass),
      role=chap.role
    )

    session.add(user)
    session.commit()
    session.refresh(user)
    return user
  # The reason it looks empty or unexpected is that user is a reserved system keyword in PostgreSQL. When you run SELECT * FROM user; without quotes, PostgreSQL evaluates user as a special function that returns the current logged-in user name (postgres), rather than querying your actual table.
  except Exception as e:
    raise  HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="try again") 

@app.post("/login",summary='user login endpoint',description="a consolidated user login endpoint, which sits at the start of the workflow")
def userLogin(chap:LoginModel,session:SessionDep):
  user=session.exec(select(User).where(User.email==chap.email)).first()
  if not user or not verifyFunc(user.user_pass,chap.password):
    raise Exception(status=status.HTTP_400_BAD_REQUEST,detail="try again")

  token={"id":user.id,"role":user.role,'email':user.email,'name':user.name}
  jwt=tokenizeFunc(token)
  return {"token_type":"BEARER","token":jwt}
