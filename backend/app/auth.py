import logging
import os
from contextvars import ContextVar
from collections.abc import Sequence
from typing import Any, Optional

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

load_dotenv()

# OIDC / Keycloak configuration
OIDC_ISSUER = (os.getenv("OIDC_ISSUER") or "").rstrip("/")
OIDC_JWKS_URL = (os.getenv("OIDC_JWKS_URL") or "").strip()
# Optional audience validation. Set CALIBER_OIDC_AUDIENCE or the legacy
# OIDC_AUDIENCE when the backend should enforce a specific token audience.
OIDC_AUDIENCE = (
    os.getenv("CALIBER_OIDC_AUDIENCE")
    or os.getenv("OIDC_AUDIENCE")
    or ""
).strip() or None
# Optional local-dev bypass for frontend test-mode. Disabled by default and
# only honored when OIDC validation is not configured for this backend.
TEST_TOKEN_ALLOWED = os.getenv("TEST_TOKEN_ALLOWED", "false").lower() in ("1", "true", "yes")
TEST_TOKEN_USER_ID = os.getenv("TEST_TOKEN_USER_ID", "test-user-1")

_oidc_jwks_client = None
_current_user_id: ContextVar[Optional[str]] = ContextVar("current_user_id", default=None)
_current_user_email: ContextVar[Optional[str]] = ContextVar("current_user_email", default=None)
_current_user_name: ContextVar[Optional[str]] = ContextVar("current_user_name", default=None)
_current_user_token: ContextVar[Optional[str]] = ContextVar("current_user_token", default=None)


def _audience_matches(claims: dict[str, Any], expected: str | None) -> bool:
    if not expected:
        return True
    aud = claims.get("aud")
    if isinstance(aud, str) and aud == expected:
        return True
    if isinstance(aud, Sequence) and expected in aud:
        return True
    azp = claims.get("azp")
    return isinstance(azp, str) and azp == expected


def _get_oidc_jwks_client() -> PyJWKClient:
    global _oidc_jwks_client
    if _oidc_jwks_client is None:
        jwks_url = OIDC_JWKS_URL or (f"{OIDC_ISSUER}/protocol/openid-connect/certs" if OIDC_ISSUER else "")
        if not jwks_url:
            raise ValueError("OIDC_ISSUER or OIDC_JWKS_URL must be configured")
        _oidc_jwks_client = PyJWKClient(jwks_url)
    return _oidc_jwks_client


def _is_local_test_token_enabled() -> bool:
    return TEST_TOKEN_ALLOWED and not (OIDC_ISSUER or OIDC_JWKS_URL)


# Security scheme for Bearer token (optional to allow cookie auth)
security = HTTPBearer(auto_error=False)


def _set_current_user_context(
    *,
    user_id: Optional[str],
    email: Optional[str],
    full_name: Optional[str],
    token: Optional[str],
) -> None:
    _current_user_id.set(user_id)
    _current_user_email.set(email)
    _current_user_name.set(full_name)
    _current_user_token.set(token)


def _extract_request_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> Optional[str]:
    token = None

    if credentials:
        token = credentials.credentials

    if not token:
        token = request.cookies.get("access_token")

    return token.strip() if token else None


def resolve_request_user_context(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
    *,
    raise_on_error: bool,
) -> Optional[tuple[str, Optional[str], Optional[str], str]]:
    token = _extract_request_token(request, credentials)
    if not token:
        _set_current_user_context(
            user_id=None,
            email=None,
            full_name=None,
            token=None,
        )
        if raise_on_error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated. Please log in via the frontend or provide a Bearer token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return None

    if _is_local_test_token_enabled() and token == "test-token-1":
        _set_current_user_context(
            user_id=TEST_TOKEN_USER_ID,
            email=None,
            full_name=None,
            token=token,
        )
        return TEST_TOKEN_USER_ID, None, None, token

    try:
        user_id, email, full_name = verify_jwt_token(token)
    except HTTPException:
        _set_current_user_context(
            user_id=None,
            email=None,
            full_name=None,
            token=None,
        )
        if raise_on_error:
            raise
        return None

    _set_current_user_context(
        user_id=user_id,
        email=email,
        full_name=full_name,
        token=token,
    )
    return user_id, email, full_name, token


def _decode_keycloak_token(token: str) -> tuple[str, Optional[str], Optional[str]]:
    if not OIDC_ISSUER and not OIDC_JWKS_URL:
        raise ValueError("OIDC_ISSUER or OIDC_JWKS_URL must be configured")

    jwks_client = _get_oidc_jwks_client()
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    decode_kwargs: dict[str, Any] = {
        "algorithms": ["RS256", "RS384", "RS512"],
        "options": {"verify_aud": False},
    }
    if OIDC_ISSUER:
        decode_kwargs["issuer"] = OIDC_ISSUER
    payload = jwt.decode(token, signing_key.key, **decode_kwargs)

    if not _audience_matches(payload, OIDC_AUDIENCE):
        raise jwt.InvalidTokenError("Token audience mismatch")

    user_id = payload.get("sub")
    if not user_id:
        raise jwt.InvalidTokenError("Token missing subject")
    email = payload.get("email") or payload.get("preferred_username")
    full_name = payload.get("name")
    return user_id, email, full_name


def verify_jwt_token(token: str) -> tuple[str, Optional[str], Optional[str]]:
    """
    Verify a JWT token and return the user ID and email.

    Supports Keycloak/OIDC tokens via realm JWKS.

    Args:
        token: The JWT token string

    Returns:
        tuple: (user_id, email) from the validated token

    Raises:
        HTTPException: If the token is invalid or expired
    """

    try:
        return _decode_keycloak_token(token)
    except jwt.ExpiredSignatureError:
        logging.warning("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.InvalidTokenError, ValueError) as e:
        logging.error("Invalid token: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        # Log the actual error for debugging while returning generic message to client
        logging.error("Authentication error: %s: %s", type(e).__name__, str(e))
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
    2. access_token cookie (set by portal Keycloak login callback)
    
    This allows browser sessions to work without frontend token storage.
    
    Args:
        request: The FastAPI request object to access cookies
        credentials: Optional HTTP Authorization credentials containing the Bearer token
        
    Returns:
        str: The user ID from the validated token
        
    Raises:
        HTTPException: If no valid token is found or token is invalid
    """
    resolved = resolve_request_user_context(
        request,
        credentials,
        raise_on_error=True,
    )
    assert resolved is not None
    return resolved[0]


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[str]:
    """
    Optional authentication - returns user ID if authenticated, None otherwise.
    Useful for endpoints that work differently for authenticated vs anonymous users.
    
    Checks both Bearer token and cookie authentication, same as get_current_user.
    """
    resolved = resolve_request_user_context(
        request,
        credentials,
        raise_on_error=False,
    )
    return resolved[0] if resolved else None


def get_current_user_id() -> Optional[str]:
    return _current_user_id.get()


def get_current_user_email() -> Optional[str]:
    return _current_user_email.get()


def get_current_user_name() -> Optional[str]:
    return _current_user_name.get()


def get_current_user_token() -> Optional[str]:
    return _current_user_token.get()
