from pydantic import BaseModel


class PublicProfile(BaseModel):
    """What anyone can see about a student: the same as their posts show, never their email."""
    id: int
    username: str
    first_name: str
    last_name: str
    is_premium: bool
    # catalog ids
    university: str
    college: str
    major: str
    # on the viewer's friends list
    is_friend: bool = False


class FriendList(BaseModel):
    friends: list[PublicProfile]
    count: int
    # 100, or 500 for premium
    limit: int
