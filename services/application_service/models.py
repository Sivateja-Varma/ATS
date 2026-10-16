from sqlmodel import SQLModel,Field,text
from datetime import datetime
from sqlalchemy import TIMESTAMP
from enum import Enum

class Status(str,Enum):
  submitted="submitted"
  reviewed="reviewed"
  rejected="rejected"


class ApplicationPublic(SQLModel):
  job_id:int
  cand_id:int
  

class Application(ApplicationPublic,table=True):
  id : int | None = Field(default=None,primary_key=True)
  score:int  
  status:Status=Field(default=Status.submitted)
  applied_at:datetime=Field(sa_type=TIMESTAMP(timezone=True),sa_column_kwargs={"server_default":text("CURRENT_TIMESTAMP")})

  
