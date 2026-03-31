"""CamelCase enforcement at API boundaries."""
import re
from typing import Any


def camel_to_snake(name: str) -> str:
    """Convert camelCase to snake_case."""
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


def convert_to_snakecase(data: Any) -> Any:
    """
    Recursively convert all camelCase keys to snake_case.
    
    Args:
        data: Any JSON-like structure
        
    Returns:
        Same structure with all keys converted to snake_case
    """
    if isinstance(data, dict):
        return {camel_to_snake(k): convert_to_snakecase(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_to_snakecase(item) for item in data]
    return data


def snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase."""
    components = name.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


def convert_to_camelcase(data: Any) -> Any:
    """
    Recursively convert all snake_case keys to camelCase.
    
    Args:
        data: Any JSON-like structure
        
    Returns:
        Same structure with all keys converted to camelCase
    """
    if isinstance(data, dict):
        return {snake_to_camel(k): convert_to_camelcase(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_to_camelcase(item) for item in data]
    return data


def detect_snake_case_keys(data: Any, path: str = "") -> list[str]:
    """
    Recursively detect any snake_case keys in a JSON-like structure.
    
    Args:
        data: Any JSON-like structure (dict, list, or primitive)
        path: Current key path for error reporting
        
    Returns:
        List of full key paths containing snake_case
    """
    violations = []
    
    if isinstance(data, dict):
        for key, value in data.items():
            current_path = f"{path}.{key}" if path else key
            
            if "_" in key:
                violations.append(current_path)
            
            if isinstance(value, (dict, list)):
                violations.extend(detect_snake_case_keys(value, current_path))
                
    elif isinstance(data, list):
        for i, item in enumerate(data):
            violations.extend(detect_snake_case_keys(item, f"{path}[{i}]"))
    
    return violations


def validate_camelcase_only(data: Any) -> dict[str, Any]:
    """
    Validate that a JSON payload contains only camelCase keys.
    
    Args:
        data: Any JSON-like structure from request body
        
    Returns:
        {} if valid
        
    Raises:
        ValueError if snake_case keys detected
    """
    if data is None:
        return {}
    
    violations = detect_snake_case_keys(data)
    
    if violations:
        raise ValueError(
            f"snake_case keys are not allowed at API boundaries. Found: {violations}"
        )
    
    return {}


def enforce_camelcase_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Enforce camelCase-only at API boundary.
    
    Args:
        payload: Request body dictionary
        
    Returns:
        The same payload if valid
        
    Raises:
        ValueError with details about invalid keys
    """
    violations = detect_snake_case_keys(payload)
    
    if violations:
        raise ValueError(
            "invalidPayload",
        )
    
    return payload
