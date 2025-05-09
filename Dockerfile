FROM node:18.17.1

RUN apt-get update && \
    apt-get install -y ffmpeg  && \
    apt-get clean
    
WORKDIR /app

RUN npm install -g npm@9.6.7

COPY package*.json ./
RUN npm install

COPY ./main.js /app/main.js

CMD ["node", "main.js"]

