from sqlmodel import create_engine,Session
from dotenv import load_dotenv
from typing import Annotated
from fastapi import Depends
import os 
load_dotenv()


db_url=os.getenv('POSTGRES_URL')

engine=create_engine(db_url)

def Session_giver():
  with Session(engine) as session:
    yield session

SessionDep=Annotated[Session,Depends(Session_giver)]    