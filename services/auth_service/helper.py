from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError,VerificationError
from datetime import datetime,timedelta
from jose import jwt , JWTError
from dotenv import load_dotenv
load_dotenv()
import os 


hasher=PasswordHasher()

SECRET_KEY=os.getenv('secret_key')
ALGORITHM="HS256"

def hashingFunc(passw:str)->str:
  return hasher.hash(passw)
def verifyFunc(hash,loginpass):
  try:
    return hasher.verify(hash,loginpass)
  except (VerifyMismatchError,VerificationError):
    return False
def tokenizeFunc(tok:dict)->str:
    token=tok.copy()
    expire=datetime.now()+timedelta(minutes=20)
    token=token.update({"exp":expire})
    return jwt.encode(token,SECRET_KEY,algorithm=ALGORITHM)
