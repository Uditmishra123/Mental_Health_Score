import joblib
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel , Field
from typing import Literal
from fastapi.middleware.cors import CORSMiddleware

model = joblib.load('Mental_Health_Model.pkl')

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

in_grouped_countries = ['India','USA','Canada','Australia','UK','Germany','Mexico','Turkey','France']

class StudentData(BaseModel):
    Age: int = Field(..., ge = 10 , le = 100)
    Gender: Literal['Male', 'Female']
    Country: str 
    Academic_Level: Literal['High School', 'Undergraduate', 'Graduate']
    Most_Used_Platform: Literal['Facebook', 'LinkedIn', 'Instagram', 'Snapchat', 'Twitter',
       'YouTube', 'TikTok', 'LINE', 'KakaoTalk', 'VKontakte', 'WhatsApp',
       'WeChat']
    Purpose_Of_Use: Literal['Networking', 'Education', 'Entertainment', 'News']
    Avg_Daily_Usage_Hours: float = Field(..., ge = 0 , le = 24)
    Daily_Unlocks: int = Field(..., ge = 0)
    Study_Hours: float = Field(..., ge = 0)
    Physical_Activity_Hours: float = Field(..., ge = 0)
    Sleep_Hours_Per_Night: float = Field(..., ge = 0)
    Stress_Level: Literal['Medium', 'Low', 'Very High', 'High']


#Describe what we send back
class PredictionResponse(BaseModel):
    predicted_score : float

@app.get("/")
def greet():
    return {"message": "Welcome to the Mental Health Prediction API!"}

@app.post('/predict' , response_model=PredictionResponse)

def predict(data : StudentData ):

    country_to_belong = data.Country if data.Country in in_grouped_countries else 'Other'
    input_row = pd.DataFrame([{
        'Age': data.Age,
        'Gender': data.Gender,
        'Country': data.Country,
        'Academic_Level': data.Academic_Level,
        'Most_Used_Platform': data.Most_Used_Platform,
        'Purpose_Of_Use' : data.Purpose_Of_Use,
        'Avg_Daily_Usage_Hours' : data.Avg_Daily_Usage_Hours,
        'Daily_Unlocks' : data.Daily_Unlocks,
        'Study_Hours' : data.Study_Hours,
        'Physical_Activity_Hours' : data.Physical_Activity_Hours,
        'Sleep_Hours_Per_Night' : data.Sleep_Hours_Per_Night,
        'Stress_Level' : data.Stress_Level,
        'grouped_countries' : country_to_belong
    }])

    prediction = model.predict(input_row)[0]

    return PredictionResponse(predicted_score=round(float(prediction), 2))