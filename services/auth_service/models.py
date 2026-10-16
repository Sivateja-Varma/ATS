from sqlmodel import SQLModel,Field,column
from typing import List
from enum import Enum


class Roles(str,Enum):
  recruiter="recruiter"
  seeker="seeker"
  staffing="staffing"

class UserPublic(SQLModel):
  email:str
  name:str
  user_pass:str
  role:str

class RegUSer(UserPublic):
  role:Roles  

class User(UserPublic,table=True):
  id : int|None = Field(default=None,primary_key=True)  