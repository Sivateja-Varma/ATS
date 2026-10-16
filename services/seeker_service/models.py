from sqlmodel import SQLModel,Field, Column, JSON
from typing import List
from enum import Enum

class Strength(str,Enum):
  python="python"
  java="java"
  javascript="javascript"

class SeekerCreation(SQLModel):
  name:str
  # strengths:List[Strength] = Field(max_items=3)

class SeekerPublic(SQLModel):
  name:str
  strengths:List[str] = Field(sa_column=Column(JSON))
  resume_path:str|None=Field(default=None)

class Seeker(SeekerPublic,table=True):
  id : int | None = Field(default=None,primary_key=True)


