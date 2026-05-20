import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

# Configuration
SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "singapene-dev-secret-2025-insecure-for-dev-only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

# Password hashing - use pbkdf2_sha256 for better compatibility
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ============ Password Functions ============

def hash_password(plain_password: str) -> str:
    """Hash a plain text password."""
    return pwd_context.hash(plain_password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)

# ============ Token Functions ============

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# ============ FastAPI Dependencies ============

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Get the current authenticated user from the token."""
    payload = decode_token(token)

    user_id: int = int(payload.get("sub"))
    username: str = payload.get("username")
    role: str = payload.get("role")
    full_name: str = payload.get("full_name")

    if user_id is None or username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "user_id": user_id,
        "username": username,
        "role": role,
        "full_name": full_name,
    }

async def require_officer(current_user: dict = Depends(get_current_user)) -> dict:
    """Require that the current user is an officer."""
    if current_user["role"] != "officer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Officer access required",
        )
    return current_user

async def require_citizen(current_user: dict = Depends(get_current_user)) -> dict:
    """Require that the current user is a citizen."""
    if current_user["role"] != "citizen":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Citizen access required",
        )
    return current_user

async def require_commissioner(current_user: dict = Depends(get_current_user)) -> dict:
    """Require that the current user is a commissioner (read-only intelligence access)."""
    if current_user["role"] != "commissioner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Commissioner access required",
        )
    return current_user
