import os
import json
from flask import Flask, render_template, session, redirect, url_for, request

# For reading Excel
import pandas as pd

app = Flask(__name__)
app.secret_key = "supersecretkey"   # Needed for sessions

# Load products once from JSON
def load_products():
    json_path = os.path.join(app.root_path, "static", "data.json")
    with open(json_path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    return data["data"]
## Removed duplicate root route to fix Flask error

# Marketing page now also receives the session’s selected product
@app.route("/marketing_template_editor")
def marketing_template_editor():
    products = load_products()
    selected = session.get("selected_product")
    # Passing products in a "data" key and the selected product.
    return render_template("marketing_template_editor.html", data={'data': products}, selected=selected)

# New Product page that implements the same functionality as marketing page
@app.route("/product")
def product_page():
    products = load_products()
    # Pass the products to a new product.html template (which you create similar to marketing.html)
    return render_template("product.html", data={'data': products})


@app.route("/select/<item_code>")
def select_product(item_code):
    """Store selected product in session"""
    products = load_products()
    selected = next((p for p in products if p.get("item_code") == item_code), None)
    if selected:
        session["selected_product"] = selected
    return redirect(url_for("show_selected"))

@app.route("/selected")
def show_selected():
    """Show the selected product from session"""
    product = session.get("selected_product")
    return render_template("selected.html", product=product)

@app.route("/listing")
def listing():
    products = load_products()         # load products from data.json
    return render_template("listing.html", products=products)



# @app.route("/marketing_template_listing")
# def marketing_template_listing():
#     products = load_products()         # load products from data.json
#     return render_template("listing.html", products=products)

# Upload two templates and display one below the other at root URL
@app.route("/")
def home():
    return redirect(url_for("marketing_template_editor"))


# Upload Primary and Secondary Template: display one below the other
@app.route("/upload_primary_secondary", methods=["GET", "POST"])
def upload_primary_secondary():
    if request.method == "POST":
        file1 = request.files.get("primary_template")
        file2 = request.files.get("secondary_template")
        filenames = []
        print(f"Primary template uploaded: {file1.filename if file1 else None}")
        print(f"Secondary template uploaded: {file2.filename if file2 else None}")
        if file1:
            filename1 = "uploaded_primary_template.html"
            file1.save(os.path.join(app.root_path, "templates", filename1))
            print(f"Saved primary template as {filename1}")
            filenames.append(filename1)
        if file2:
            filename2 = "uploaded_secondary_template.html"
            file2.save(os.path.join(app.root_path, "templates", filename2))
            print(f"Saved secondary template as {filename2}")
            filenames.append(filename2)
        print(f"Filenames list for output: {filenames}")
        return render_template("show_primary_secondary.html", filenames=filenames)
    return render_template("upload_primary_secondary.html")


if __name__ == "__main__":
    app.run(debug=True)