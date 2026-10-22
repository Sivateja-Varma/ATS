from fastapi.security import HTTPBearer
from fastapi import Depends,HTTPException,status
from jose import jwt
from typing import List
import os 
from dotenv import load_dotenv
curr=os.path.dirname(os.path.abspath(__file__))
env_path=os.path.join(curr,"..","services","auth_service",".env")
load_dotenv(dotenv_path=env_path)
secret=os.getenv("secret_key")
algo=os.getenv("ALGORITHM")

security=HTTPBearer()

# def deToken(token:str=Depends(security)):
#   try:
#     token=token.credentials
#     return jwt.decode(token,secret,algorithms=[algo])
#   except Exception as e:
#     raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,detail="you are not allowed")


def RoleCheck(roles:List[str]):
  def deToken(token:str=Depends(security)):
    try:
      token=token.credentials
      new=jwt.decode(token,secret,algorithms=[algo])
      if new.get('role') in roles:
        return new
      else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="You are not authorized")
    except Exception as e:
      raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,detail="you are not allowed")
  return deToken  
    


  