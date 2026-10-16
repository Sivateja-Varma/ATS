from fastapi import FastAPI,status
from .models import User,UserPublic,RegUSer
from .db import SessionDep
from typing import List
from sqlmodel import SQLModel,select


app=FastAPI(title="Auth Service",summary="consolidated Auth service for the entire application",docs_url="/docs")


@app.get('/health-check',status_code=status.HTTP_200_OK)
async def healthCheck():
  return {"service":"Auth","status":"live"}

@app.get('/users',status_code=status.HTTP_200_OK,response_model=List[UserPublic])
def allUsers(session:SessionDep):
  users=session.exec(select(User)).all()
  return users

