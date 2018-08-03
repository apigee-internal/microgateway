FROM kennethreitz/httpbin
CMD ["gunicorn", "-b", "0.0.0.0:8082", "httpbin:app", "-k", "gevent"]