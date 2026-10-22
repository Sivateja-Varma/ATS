from sqlmodel import SQLModel,Field,column
from typing import List
from enum import Enum


class Roles(str,Enum):
  recruiter="recruiter"
  seeker="seeker"
  staffing="staffing"

class UserReq(SQLModel):
  email:str
  name:str
  user_pass:str
  role:str

class LoginModel(SQLModel):
  email:str
  password:str  

class UserPublic(SQLModel):
  id:int
  email:str  
  name:str
  role:str

class RegUSer(UserReq):
  role:Roles  

class User(UserReq,table=True):
  id : int|None = Field(default=None,primary_key=True)  
  email:str = Field(index=True,unique=True)
