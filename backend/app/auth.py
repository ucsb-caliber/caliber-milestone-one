import os
from typing import Optional
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

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
        # Get Supabase client
        supabase = get_supabase_client()
        
        # Verify the JWT token with Supabase
        user = supabase.auth.get_user(token)
        
        if not user or not user.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user.user.id
        
    except Exception as e:
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
