import os

file_path = r"d:\AIOCRM\backend\auth_store.py"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_index = -1
for i, line in enumerate(lines):
    if 'def _payment_provider_record(self, record: sqlite3.Row' in line:
        start_index = i
        break

end_index = -1
for i, line in enumerate(lines):
    if i > start_index and 'if existing:' in line and 'conn.execute(' in lines[i+1]:
        end_index = i
        break

if start_index == -1 or end_index == -1:
    print(f"Error finding indices: start={start_index}, end={end_index}")
else:
    restored_block = [
        '    def _payment_provider_record(self, record: sqlite3.Row | dict[str, Any], include_secret: bool = False) -> dict[str, Any]:\n',
        '        config = json.loads(record["configJson"]) if record["configJson"] else {}\n',
        '        payload = {\n',
        '            "id": record["id"],\n',
        '            "tenantId": record["tenantId"],\n',
        '            "providerKey": record["providerKey"],\n',
        '            "label": record["label"],\n',
        '            "enabled": bool(record["enabled"]),\n',
        '            "status": record["status"],\n',
        '            "lastTestedAt": record["lastTestedAt"],\n',
        '            "lastError": record["lastError"],\n',
        '            "config": config,\n',
        '            "apiKeyPresent": bool(config.get("apiKey") or config.get("secretKey")),\n',
        '            "createdAt": record["createdAt"],\n',
        '            "updatedAt": record["updatedAt"],\n',
        '        }\n',
        '        if include_secret:\n',
        '            payload["apiKey"] = config.get("apiKey")\n',
        '            payload["secretKey"] = config.get("secretKey")\n',
        '        return payload\n',
        '\n',
        '    def _require_workspace_role(self, conn: sqlite3.Connection, user_id: str, tenant_id: str, allowed_roles: set[str]) -> sqlite3.Row:\n',
        '        self._require_active_workspace_row(conn, tenant_id)\n',
        '        membership = conn.execute(\n',
        '            "SELECT * FROM memberships WHERE userId = ? AND tenantId = ? LIMIT 1",\n',
        '            (user_id, tenant_id),\n',
        '        ).fetchone()\n',
        '        if not membership:\n',
        '            raise ValueError("User does not belong to that workspace.")\n',
        '        if membership["role"] not in allowed_roles:\n',
        '            raise ValueError("You do not have permission to manage this workspace.")\n',
        '        return membership\n',
        '\n',
        '    def _build_session(self, conn: sqlite3.Connection, record: sqlite3.Row) -> dict[str, Any]:\n',
        '        """Convert database record to a session dictionary with capabilities."""\n',
        '        current_tenant, tenants = self._tenant_memberships(conn, record["userId"], record["currentTenantId"])\n',
        '        user_id = record["userId"]\n',
        '        tenant_id = current_tenant.get("id") if current_tenant else None\n',
        '        capabilities = []\n',
        '        if tenant_id:\n',
        '            capabilities = self.get_effective_capabilities(tenant_id, "user", user_id)\n',
        '        return {\n',
        '            "id": record["id"],\n',
        '            "token": record["token"],\n',
        '            "provider": record["provider"],\n',
        '            "createdAt": record["createdAt"],\n',
        '            "expiresAt": record["expiresAt"],\n',
        '            "user": self._public_user(record),\n',
        '            "tenant": current_tenant,\n',
        '            "tenants": tenants,\n',
        '            "capabilities": capabilities,\n',
        '        }\n',
        '\n',
        '    @staticmethod\n',
        '    def _persistable_user_settings(user_settings: dict[str, Any]) -> dict[str, Any]:\n',
        '        persisted = normalize_user_settings_payload(user_settings, include_defaults=True)\n',
        '        persisted["profile"]["phone"] = ""\n',
        '        persisted["preferences"]["locale"] = ""\n',
        '        persisted["preferences"]["timezone"] = ""\n',
        '        persisted["comms"]["emailSignature"] = ""\n',
        '        return persisted\n',
        '\n',
        '    def _upsert_global_variables_from_canonical(self, conn: sqlite3.Connection, tenant_id: str, userId: str | None, variables: dict[str, Any]) -> None:\n',
        '        for key, details in variables.items():\n',
        '            if not isinstance(details, dict):\n',
        '                continue\n',
        '            value = details.get("value")\n',
        '            if value is None:\n',
        '                continue\n',
        '            label = (details.get("label") or key).strip()\n',
        '            category = (details.get("category") or ("system" if details.get("isSystem") else "custom")).strip() or "custom"\n',
        '            config = {\n',
        '                "label": label,\n',
        '                "category": category,\n',
        '                "editableByClient": bool(details.get("editableByClient", not details.get("isSystem"))),\n',
        '            }\n',
        '            existing = conn.execute(\n',
        '                "SELECT id FROM global_variables WHERE tenantId = ? AND key = ? LIMIT 1",\n',
        '                (tenant_id, key),\n',
        '            ).fetchone()\n',
        '            now = utcnow_iso()\n',
        '            params = (\n',
        '                str(value),\n',
        '                (details.get("description") or "").strip() or None,\n',
        '                1 if details.get("isSecret") else 0,\n',
        '                1 if details.get("isSystem") else 0,\n',
        '                json.dumps(config),\n',
        '                now,\n',
        '            )\n'
    ]
    
    new_lines = lines[:start_index] + restored_block + lines[end_index:]
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print("Restore complete.")
