# WSGI entry point for production deployment
from marketing_template.app import app

if __name__ == "__main__":
    app.run()
