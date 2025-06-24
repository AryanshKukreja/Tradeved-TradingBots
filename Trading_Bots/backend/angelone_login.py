from SmartApi import SmartConnect
import time, json, sys
import pyotp

# Your AngelOne credentials
login_credential = {
    "api_key": "blhhZPnX",
    "user_id": "AAAN535987",  # CLIENT_CODE
    "pin": "2005",           # MPIN
    "totp_code": "LW6SSMTSZSI3T64WITMTF4AOSU"  # TOTP Secret
}

# Optional: Load from file if it exists (for future use)
try:
    with open("angleone_login_details.json", "r") as f:
        saved_credentials = json.load(f)
        print("Using saved credentials from file...")
        login_credential = saved_credentials
except FileNotFoundError:
    print("Using hardcoded credentials...")
    # Optionally save credentials to file for future use
    if input("Press Y to save credentials to file, any other key to skip: ").upper() == "Y":
        with open("angleone_login_details.json", "w") as f:
            json.dump(login_credential, f, indent=2)
        print("✅ Credentials saved to angleone_login_details.json")

# Begin login process
try:
    print("🔐 Attempting login to AngelOne...")
    
    # Step 1: Initialize SmartConnect with API key
    obj = SmartConnect(api_key=login_credential["api_key"])
    print("📡 SmartConnect initialized...")
    
    # Step 2: Generate TOTP code and create session
    totp_code = pyotp.TOTP(login_credential["totp_code"]).now()
    print(f"🔢 Generated TOTP: {totp_code}")
    
    session_data = obj.generateSession(
        login_credential["user_id"],
        login_credential["pin"],
        totp_code
    )
    
    if session_data["status"]:
        session_info = session_data["data"]
        print("✅ Session created successfully")
    else:
        raise Exception(f"Session creation failed: {session_data.get('message', 'Unknown error')}")
    
    # Step 3: Generate JWT token using refresh token
    token_response = obj.generateToken(session_info["refreshToken"])
    
    if token_response["status"]:
        token_data = token_response["data"]
        jwt_token = token_data["jwtToken"]
        refresh_token = token_data["refreshToken"]
        print("✅ JWT token generated successfully")
    else:
        raise Exception(f"Token generation failed: {token_response.get('message', 'Unknown error')}")
    
    # Step 4: Get feed token
    feed_token = obj.getfeedToken()
    
    print("\n" + "="*50)
    print("🎉 LOGIN SUCCESSFUL!")
    print("="*50)
    print(f"CLIENT_CODE       : {login_credential['user_id']}")
    print(f"API_KEY           : {login_credential['api_key']}")
    print(f"JWT_TOKEN         : {jwt_token}")
    print(f"REFRESH_TOKEN     : {refresh_token}")
    print(f"FEED_TOKEN        : {feed_token}")
    print("="*50)
    
    # Save tokens to file for future API calls
    token_file = {
        "client_code": login_credential['user_id'],
        "api_key": login_credential['api_key'],
        "jwt_token": jwt_token,
        "refresh_token": refresh_token,
        "feed_token": feed_token,
        "timestamp": time.time()
    }
    
    with open("smartapi_tokens.json", "w") as f:
        json.dump(token_file, f, indent=2)
    print("💾 Tokens saved to smartapi_tokens.json")
    
    # Test the connection with a simple API call
    try:
        profile = obj.getProfile(refresh_token)
        if profile["status"]:
            print(f"👤 Welcome, {profile['data'].get('name', 'User')}!")
        else:
            print("⚠️ Profile fetch failed but login was successful")
    except Exception as profile_error:
        print(f"⚠️ Profile test failed: {profile_error}")
    
except Exception as e:
    print(f"\n❌ Login Failed: {str(e)}")
    print("Please check your credentials and try again.")
    time.sleep(5)
    sys.exit(1)

print("\n🚀 Ready to use AngelOne API!")