from sqlmodel import SQLModel,create_engine,Session
from fastapi import Depends
from typing import Annotated
from dotenv import load_dotenv
import os 
load_dotenv()

db_url=os.getenv('POSTGRES_URL')

engine = create_engine(db_url)

def Session_Giver():
  with Session(engine) as session:
    yield session

SessionDep=Annotated[Session,Depends(Session_Giver)]    

