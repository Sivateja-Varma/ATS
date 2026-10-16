from sqlmodel import create_engine,Session
import os 
from fastapi import Depends
from typing import Annotated
from dotenv import load_dotenv
load_dotenv()

db_url=os.getenv('POSTGRES_URL')

engine=create_engine(db_url)

def Session_giver():
  with Session(engine) as session:
    yield session

SessionDep = Annotated[Session,Depends(Session_giver)]   