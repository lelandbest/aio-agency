from backend.auth_store import get_auth_store

store = get_auth_store()
print(store.list_workspace_roles("dummy_token", "lelandbest/aio-agency"))
