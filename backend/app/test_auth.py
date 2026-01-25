"""
Mock authentication for testing without Supabase.
This module provides test tokens and user IDs for development/testing.
"""

from typing import Optional

TEST_USER_ID = "test-user-1"
TEST_USER_ID_2 = "test-user-2"
TEST_TOKEN = "test-token-1"
TEST_TOKEN_2 = "test-token-2"

# Mock user mapping
MOCK_USERS = {
    TEST_TOKEN: TEST_USER_ID,
    TEST_TOKEN_2: TEST_USER_ID_2,
}

def get_mock_user_id(token: str) -> Optional[str]:
    """Get user ID from mock token. Returns None if token is not a test token."""
    return MOCK_USERS.get(token)
