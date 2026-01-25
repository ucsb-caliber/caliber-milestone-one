import os
import logging
import jwt
import requests
from typing import Optional
from fastapi import HTTPException, status, Depends, Request, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from jwt import PyJWKClient
from urllib.parse import urljoin
from .test_auth import get_mock_user_id

load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")  # Optional, for legacy projects

# Lazy-load supabase client
_supabase_client = None
_jwks_client = None


def get_supabase_client():
    """Get or create the Supabase client instance."""
    global _supabase_client
    
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables")
        
        from supabase import create_client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    return _supabase_client


def get_jwks_client():
    """Get or create the JWKS client for verifying Supabase JWTs."""
    global _jwks_client
    
    if _jwks_client is None:
        if not SUPABASE_URL:
            raise ValueError("SUPABASE_URL must be set in environment variables")
        
        # Supabase JWKS endpoint is at /auth/v1/jwks
        jwks_url = urljoin(SUPABASE_URL, "/auth/v1/.well-known/jwks.json")
        _jwks_client = PyJWKClient(jwks_url)
    
    return _jwks_client


# Security scheme for Bearer token (optional to allow cookie auth)
security = HTTPBearer(auto_error=False)


def verify_jwt_token(token: str) -> str:
    """
    Verify a JWT token and return the user ID.
    
    Supports:
    - Test tokens for development (e.g., "test-token-1")
    - Modern Supabase projects using asymmetric JWKS (RS256/ES256)  
    - Legacy Supabase projects using shared secret (HS256)
    
    Args:
        token: The JWT token string
        
    Returns:
        str: The user ID from the validated token
        
    Raises:
        HTTPException: If the token is invalid or expired
    """
    
    # Check for test tokens first (for development/testing)
    mock_user = get_mock_user_id(token)
    if mock_user:
        logging.info(f"Using mock authentication for test token")
        return mock_user
    
    try:
        # First, try to decode the token header to see what algorithm it uses
        unverified_header = jwt.get_unverified_header(token)
        algorithm = unverified_header.get("alg", "")
        
        # Modern Supabase uses RS256 or ES256 with JWKS
        if algorithm in ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"]:
            logging.info(f"Verifying token with JWKS (algorithm: {algorithm})")
            
            # Get the signing key from JWKS
            jwks_client = get_jwks_client()
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            
            # Decode and verify with the public key
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=[algorithm],
                options={"verify_aud": False}  # Supabase doesn't always set audience
            )
        
        # Legacy Supabase uses HS256 with shared secret
        elif algorithm in ["HS256", "HS384", "HS512"]:
            logging.info(f"Verifying token with JWT secret (algorithm: {algorithm})")
            
            if not SUPABASE_JWT_SECRET:
                raise ValueError(
                    "Token uses HS256 algorithm but SUPABASE_JWT_SECRET is not set. "
                    "For legacy Supabase projects, add SUPABASE_JWT_SECRET to your .env file."
                )
            
            # Decode and verify with shared secret
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=[algorithm],
                options={"verify_aud": False}
            )
        
        else:
            raise jwt.InvalidTokenError(f"Unsupported algorithm: {algorithm}")
        
        # Extract user ID from the 'sub' claim
        user_id = payload.get("sub")
        if not user_id:
            logging.warning("Token verification failed: No 'sub' claim in token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user_id
        
    except jwt.ExpiredSignatureError:
        logging.warning("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logging.error(f"Invalid token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        # Log the actual error for debugging while returning generic message to client
        logging.error(f"Authentication error: {type(e).__name__}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> str:
    """
    Verify the JWT token from either Bearer header or cookie and return the user ID.
    
    Checks authentication in this order:
    1. Authorization: Bearer header
    2. access_token cookie (set by frontend after Supabase login)
    
    This allows Swagger UI to work automatically when users are logged in via the frontend,
    as both run on localhost and can share cookies.
    
    Also ensures a User record exists in the database for the authenticated user.
    
    Args:
        request: The FastAPI request object to access cookies
        credentials: Optional HTTP Authorization credentials containing the Bearer token
        
    Returns:
        str: The user ID from the validated token
        
    Raises:
        HTTPException: If no valid token is found or token is invalid
    """
    token = None
    
    # Try to get token from Authorization header first
    if credentials:
        token = credentials.credentials
    
    # If not in header, try to get from cookie
    if not token:
        # Try to get the access_token from cookies
        token = request.cookies.get("access_token")
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in via the frontend or provide a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify the token using the common verification function
    user_id = verify_jwt_token(token)
    
    # Ensure user record exists in database
    from .database import engine
    from .crud import get_or_create_user
    from sqlmodel import Session
    
    with Session(engine) as session:
        get_or_create_user(session, user_id)
    
    return user_id


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[str]:
    """
    Optional authentication - returns user ID if authenticated, None otherwise.
    Useful for endpoints that work differently for authenticated vs anonymous users.
    
    Checks both Bearer token and cookie authentication, same as get_current_user.
    """
    token = None
    
    # Try to get token from Authorization header first
    if credentials:
        token = credentials.credentials
    
    # If not in header, try to get from cookie
    if not token:
        token = request.cookies.get("access_token")
    
    if not token:
        return None
    
    try:
        return verify_jwt_token(token)
    except Exception:
        return None
