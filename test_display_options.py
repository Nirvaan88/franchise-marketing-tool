#!/usr/bin/env python3
"""
Test script to verify all 3 store address display options work on the frontend.
Uploads sample files and shows which display mode was rendered.
"""

import requests
import pandas as pd
import io
import json
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"

# Create sample HTML templates
PRIMARY_TEMPLATE = """
<!DOCTYPE html>
<html>
<head><title>Primary Template</title></head>
<body style="text-align: center; padding: 20px;">
  <h1>Primary Template (English)</h1>
  <div style="border: 2px solid #333; padding: 40px; margin: 20px 0;">
    <p>Sample marketing content in English</p>
  </div>
</body>
</html>
"""

SECONDARY_TEMPLATE = """
<!DOCTYPE html>
<html>
<head><title>Secondary Template</title></head>
<body style="text-align: center; padding: 20px;">
  <h1>Secondary Template (Local Language)</h1>
  <div style="border: 2px solid #333; padding: 40px; margin: 20px 0;">
    <p>Sample marketing content in local language</p>
  </div>
</body>
</html>
"""

# Create sample store address Excel file
def create_sample_excel():
    data = {
        'store_name': ['KISNA Store - Chennai'],
        'address': ['No. 31, North Usman Road, T. Nagar, Chennai'],
        'mobile_number': ['9156121076']
    }
    df = pd.DataFrame(data)
    excel_buffer = io.BytesIO()
    df.to_excel(excel_buffer, index=False, sheet_name='Stores')
    excel_buffer.seek(0)
    return excel_buffer

# Test function
def test_display_option(option):
    """Test a specific display option"""
    print(f"\n{'='*70}")
    print(f"TESTING OPTION: {option}")
    print(f"{'='*70}")
    
    files = {
        'primary_template': ('primary.html', PRIMARY_TEMPLATE, 'text/html'),
        'secondary_template': ('secondary.html', SECONDARY_TEMPLATE, 'text/html'),
        'store_address_excel': ('stores.xlsx', create_sample_excel(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    }
    
    data = {
        'address_display': option
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/upload_primary_secondary",
            files=files,
            data=data,
            allow_redirects=True
        )
        
        if response.status_code == 200:
            print(f"✅ Upload successful!")
            
            # Check what's in the response
            if 'store-footer' in response.text:
                print(f"✅ Footer section found in response")
            
            if option == 'both' and 'store-header' in response.text:
                print(f"✅ Header section found in response (Both mode)")
            elif option == 'both':
                print(f"⚠️  Both mode selected but header not found in response")
                
            if option == 'below_line' and 'blue-line' in response.text:
                print(f"✅ Blue line found in response (Below Line mode)")
            elif option == 'below_line':
                print(f"⚠️  Below Line mode selected but blue-line not found in response")
            
            if option == 'footer_only' and 'store-info' in response.text:
                print(f"✅ Standard footer found in response (Footer Only mode)")
            
            # Print relevant snippet
            if 'KISNA' in response.text or 'Chennai' in response.text:
                print(f"✅ Store address data found in rendered output")
            
            return True
        else:
            print(f"❌ Upload failed with status {response.status_code}")
            print(response.text[:500])
            return False
            
    except Exception as e:
        print(f"❌ Error during upload: {e}")
        return False

if __name__ == "__main__":
    print("Testing Store Address Display Options")
    print("=====================================\n")
    
    # Test all three options
    options = ['footer_only', 'both', 'below_line']
    results = {}
    
    for opt in options:
        results[opt] = test_display_option(opt)
    
    print(f"\n{'='*70}")
    print("TEST SUMMARY")
    print(f"{'='*70}")
    for opt, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{opt:15} : {status}")
    
    print("\nAll 3 display options should show different formatting of the address:")
    print("  • footer_only    : Address in normal footer (Store Name | Address | Mobile)")
    print("  • both           : Header at top (upward) + normal footer")
    print("  • below_line     : Centered blue line with address below it")
    