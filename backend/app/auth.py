import os
import logging
import jwt
from typing import Optional
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# Lazy-load supabase client
_supabase_client = None


def get_supabase_client():
    """Get or create the Supabase client instance."""
    global _supabase_client
    
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables")
        
        from supabase import create_client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    return _supabase_client


# Security scheme for Bearer token
security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Verify the JWT token and return the user ID.
    
    Args:
        credentials: The HTTP Authorization credentials containing the Bearer token
        
    Returns:
        str: The user ID from the validated token
        
    Raises:
        HTTPException: If the token is invalid or expired
    """
    token = credentials.credentials
    
    try:
        # Verify JWT token using the JWT secret
        if not SUPABASE_JWT_SECRET:
            raise ValueError("SUPABASE_JWT_SECRET must be set in environment variables")
        
        # Decode and verify the JWT token
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )
        
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


def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[str]:
    """
    Optional authentication - returns user ID if authenticated, None otherwise.
    Useful for endpoints that work differently for authenticated vs anonymous users.
    """
    if not credentials:
        return None
    
    try:
        token = credentials.credentials
        supabase = get_supabase_client()
        user = supabase.auth.get_user(token)
        
        if user and user.user:
            return user.user.id
        return None
        
    except Exception:
        return None
