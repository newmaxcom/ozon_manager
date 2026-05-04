FROM node:18 AS builder

WORKDIR /ozon_manager

ENV TZ=Europe/Moscow

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5524

CMD ["npm", "run", "start"]
