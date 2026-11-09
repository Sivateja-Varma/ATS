from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr, BaseModel
from typing_extensions import TypedDict,List


class EmailSchema(BaseModel):
    email: List[EmailStr]


conf = ConnectionConfig(
    MAIL_USERNAME = "jampanasivatejavarma@gmail.com",
    MAIL_PASSWORD = "eome jofa fhoa cnly",
    MAIL_FROM = "jampanasivatejavarma@gmail.com",
    MAIL_PORT = 587,
    MAIL_SERVER = "smtp.gmail.com",
    MAIL_FROM_NAME="ATS-SPARK",
    MAIL_STARTTLS = True,
    MAIL_SSL_TLS = False,
    USE_CREDENTIALS = True,
    VALIDATE_CERTS = True
)


async def send_email(email: List[str],name:str|None=None,role:str|None=None,status:str|None=None):
    if status is not None:
        if status == "submitted":
                html = F"""<p>thanks for applying to {role} {name}, our team of recruiters wil see to it that the proceess will be smooth as butter.</p> """
        if status == "selected":
             html = F"""<p>congragulations {name}, you have been selected.You will be required to come to the office from next week.</p> """
        if status == "withdraw":
                     html = F"""<p>{name} your application has been withdrawn successfully.</p> """   
        if status == "rejected":
                             html = F"""<p>sorry{name} your application wasn't considered, Please apply again.</p> """
        if status == "reviewed":
                            html = F"""<p>you have cleared the last round{name} your application, please prepare for the next round .</p> """                                    

    message = MessageSchema(
        subject="Application Successfull",
        recipients=email,
        body=html,
        subtype=MessageType.html)

    fm = FastMail(conf)
    await fm.send_message(message)
    return {"message":"welcome email has been sent"}