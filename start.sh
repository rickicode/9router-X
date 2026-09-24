docker stop axonrouter
docker rm axonrouter
docker build -t axonrouter .
docker run -d --name axonrouter -p 3777:3777 --env-file .env -v axonrouter-data:/app/data axonrouter