import time
import logging
from pathlib import Path
from typing import Dict, Optional

import requests

from src.utils.file_utils import load_json, save_json


class OverpassClient:
    """Client for querying the Overpass API with caching and retries."""
    
    def __init__(
        self,
        endpoints: list,
        timeout: int = 180,
        max_retries: int = 3,
        retry_delay: int = 5,
        cache_dir: Optional[Path] = None,
        user_agent: str = "SafeRouteAI/1.0",
    ):
        self.endpoints = endpoints
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.cache_dir = cache_dir
        self.user_agent = user_agent
        self.logger = logging.getLogger(__name__)
        
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def query(
        self,
        query_str: str,
        cache_key: Optional[str] = None,
        use_cache: bool = True,
    ) -> Dict:
        # Check cache first
        if use_cache and cache_key and self.cache_dir:
            cache_path = self.cache_dir / f"{cache_key}.json"
            if cache_path.exists():
                self.logger.info(f"  ✓ Loading from cache: {cache_key}")
                return load_json(cache_path)
        
        # Smart retry with multiple endpoints and exponential backoff
        last_error = None
        total_attempts = 0
        max_total_attempts = len(self.endpoints) * self.max_retries
        
        for endpoint_idx, endpoint in enumerate(self.endpoints):
            for attempt in range(1, self.max_retries + 1):
                total_attempts += 1
                
                try:
                    self.logger.info(
                        f"  → [{total_attempts}/{max_total_attempts}] Querying {endpoint} "
                        f"(endpoint {endpoint_idx + 1}/{len(self.endpoints)}, attempt {attempt}/{self.max_retries})"
                    )
                    response = requests.post(
                        endpoint,
                        data={"data": query_str},
                        timeout=self.timeout,
                        headers={"User-Agent": self.user_agent},
                    )
                    
                    # ─── Handle 429 Rate Limit ───
                    if response.status_code == 429:
                        retry_after = int(response.headers.get("Retry-After", 60))
                        self.logger.warning(
                            f"  ⚠ Rate limited (429). Server says wait {retry_after}s."
                        )
                        # If we have more endpoints, try the next one immediately
                        if endpoint_idx < len(self.endpoints) - 1:
                            self.logger.info(f"  → Switching to next endpoint immediately")
                            break  # Break inner loop, continue outer loop with next endpoint
                        # Otherwise wait and retry this endpoint
                        self.logger.info(f"  → Sleeping {retry_after}s before retry...")
                        time.sleep(retry_after + 5)
                        continue
                    
                    # ─── Handle 504 Gateway Timeout ───
                    if response.status_code == 504:
                        self.logger.warning(f"  ⚠ Gateway timeout (504)")
                        # Switch endpoint immediately if available
                        if endpoint_idx < len(self.endpoints) - 1:
                            self.logger.info(f"  → Switching to next endpoint")
                            break
                        # Otherwise retry with backoff
                        wait = self.retry_delay * attempt
                        self.logger.info(f"  → Waiting {wait}s before retry...")
                        time.sleep(wait)
                        continue
                    
                    # ─── Handle 502/503 Server Errors ───
                    if response.status_code in (502, 503):
                        self.logger.warning(f"  ⚠ Server error ({response.status_code})")
                        if endpoint_idx < len(self.endpoints) - 1:
                            break
                        wait = self.retry_delay * attempt
                        time.sleep(wait)
                        continue
                    
                    # ─── Standard HTTP error handling ───
                    response.raise_for_status()
                    
                    # ─── Parse and validate response ───
                    try:
                        data = response.json()
                    except ValueError as e:
                        self.logger.error(f"  ✗ Invalid JSON response: {e}")
                        last_error = "invalid_json"
                        continue
                    
                    element_count = len(data.get("elements", []))
                    self.logger.info(f"  ✓ Received {element_count} elements")
                    
                    # Cache the result
                    if use_cache and cache_key and self.cache_dir:
                        cache_path = self.cache_dir / f"{cache_key}.json"
                        save_json(data, cache_path, compact=True)
                        self.logger.info(f"  ✓ Cached to: {cache_path.name}")
                    
                    # Polite delay between successful requests
                    time.sleep(3)
                    
                    return data
                
                except requests.exceptions.Timeout:
                    self.logger.warning(f"  ⚠ Client timeout after {self.timeout}s")
                    last_error = "timeout"
                    # Switch endpoint on timeout
                    if endpoint_idx < len(self.endpoints) - 1:
                        break
                
                except requests.exceptions.ConnectionError as e:
                    self.logger.warning(f"  ⚠ Connection error: {e}")
                    last_error = f"connection_error: {e}"
                    # Switch endpoint on connection error
                    if endpoint_idx < len(self.endpoints) - 1:
                        break
                
                except requests.exceptions.HTTPError as e:
                    self.logger.warning(f"  ⚠ HTTP error: {e}")
                    last_error = str(e)
                
                except Exception as e:
                    self.logger.warning(f"  ⚠ Unexpected error: {e}")
                    last_error = str(e)
                
                # Wait before retrying same endpoint
                if attempt < self.max_retries:
                    wait = self.retry_delay * attempt  # Exponential backoff
                    self.logger.info(f"  → Waiting {wait}s before retry...")
                    time.sleep(wait)
            
            # Wait between switching endpoints
            if endpoint_idx < len(self.endpoints) - 1:
                self.logger.info(f"  → Trying next endpoint...")
                time.sleep(5)
        
        raise RuntimeError(
            f"All Overpass endpoints failed after {total_attempts} attempts. "
            f"Last error: {last_error}"
        )