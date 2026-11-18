import os 
from dotenv import load_dotenv
from db import engine
from sqlmodel import select,Session
from argon2 import PasswordHasher
from models import User

load_dotenv()

hasher=PasswordHasher()

def pass_hasher(x:str):
  return hasher.hash(x)

# Database_url=os.getenv("DB_URL")

# if Database_url is None:
#   raise ValueError("database url not found")

# engine=create_engine(Database_url)

def createRecruit(email,name,user_pass):
  with Session(engine) as session:
    first_recuit=session.exec(select(User).where(User.email==email)).first()
    if not first_recuit:
      user=User(email=email,name=name,user_pass=pass_hasher(user_pass),role="staffing")
      session.add(user)
      session.commit()
      session.refresh(user)
      print("user created successfully")
    else:
      print("first recruit already present")

    

if __name__=="__main__":
  email,name,user_pass=os.getenv("FIRST_EMAIL"),os.getenv("FIRST_NAME"),os.getenv("FIRST_PASS")
  if not all([email,name,user_pass]):
    raise ValueError(".env values not present")
  createRecruit(email,name,user_pass)

