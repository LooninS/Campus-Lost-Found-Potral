import os

from sarvamai import SarvamAI


api_key = os.environ["SARVAM_API_KEY"]
client = SarvamAI(api_subscription_key=api_key)

response = client.chat.completions(
    model="sarvam-105b-conversations",
    messages=[{"role": "user", "content": "Say hello in one short sentence."}],
)

print(response.choices[0].message.content)
