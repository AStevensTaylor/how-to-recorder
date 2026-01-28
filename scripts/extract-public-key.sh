#!/usr/bin/env bash

set -e

echo "Extracting public key from CRX_PRIVATE_KEY secret..."
echo ""

gh secret get CRX_PRIVATE_KEY | openssl rsa -pubout 2>/dev/null

echo ""
echo "Copy the public key above (including BEGIN/END lines) and:"
echo "1. Go to https://chrome.google.com/webstore/devconsole"
echo "2. Select your extension"
echo "3. Navigate to the Package tab"
echo "4. Find the 'Verified CRX Uploads' section"
echo "5. Click 'Opt In'"
echo "6. Paste the public key when prompted"
echo ""
echo "This will protect your extension updates from unauthorized modifications."
