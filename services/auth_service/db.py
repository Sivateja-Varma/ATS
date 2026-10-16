from sqlmodel import SQLModel,Session,create_engine
from fastapi import Depends
from dotenv import load_dotenv
import os
from typing import Annotated
load_dotenv()

db_url=os.getenv('DB_URL')

engine=create_engine(db_url)

def Session_giver():
  with Session(engine) as session:
    yield session

SessionDep=Annotated[Session,Depends(Session_giver)]