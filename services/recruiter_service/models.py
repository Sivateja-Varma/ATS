from sqlmodel import SQLModel,Field,JSON,Column
from typing import List
from enum import Enum

class Keyword(str,Enum):
  python="python"
  java="java"
  javascript="javascript"


class JobStatus(str,Enum):
  open="open" #the job role is open and recruiters can pull in candidates and also seekers can apply.
  hold="hold" #recruiters cannot pull students or candidates can apply and the job role is displayed. 
  closed="closed" #job role is not shown at all.

#rounds should be a list of strings and each should be custom and in every round that the seeker passes the round is popped out of the list which is shown to the user when he is tracking the progress  
# do not pop as the full history context is lost just diplay besed on the index !!!


class JobPostPublic(SQLModel):
  role:str
  description:str = Field(max_length=3000) 
  keywords:List[Keyword]=Field(max_items=3,sa_column=Column(JSON)) 
  

class JobPost(JobPostPublic,table=True):
  id : int | None= Field(default=None,primary_key=True)
  status:str | None = Field(default=None)




