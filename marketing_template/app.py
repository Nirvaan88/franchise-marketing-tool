import os
import json
from flask import Flask, render_template, session, redirect, url_for

app = Flask(__name__)
app.secret_key = "supersecretkey"   # Needed for sessions

# Load products once from JSON
def load_products():
    json_path = os.path.join(app.root_path, "static", "data.json")
    with open(json_path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    return data["data"]
# Redirect root to marketing page
@app.route("/")
def home():
    return redirect(url_for("marketing_template_editor"))

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

if __name__ == "__main__":
    app.run(debug=True)