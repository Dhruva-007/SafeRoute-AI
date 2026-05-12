"""
Overpass API client with retry logic, caching, and multi-endpoint failover.
"""

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
        """
        Execute an Overpass query.
        
        Args:
            query_str: The Overpass QL query string
            cache_key: Identifier for caching (e.g., 'hyderabad_industrial')
            use_cache: Whether to use/write cache
        
        Returns:
            Parsed JSON response from Overpass
        """
        # Check cache first
        if use_cache and cache_key and self.cache_dir:
            cache_path = self.cache_dir / f"{cache_key}.json"
            if cache_path.exists():
                self.logger.info(f"  ✓ Loading from cache: {cache_key}")
                return load_json(cache_path)
        
        # Try each endpoint with retries
        last_error = None
        for endpoint in self.endpoints:
            for attempt in range(1, self.max_retries + 1):
                try:
                    self.logger.info(
                        f"  → Querying {endpoint} (attempt {attempt}/{self.max_retries})"
                    )
                    response = requests.post(
                        endpoint,
                        data={"data": query_str},
                        timeout=self.timeout,
                        headers={"User-Agent": self.user_agent},
                    )
                    
                    # ─── Special handling for 429 Rate Limit ───
                    if response.status_code == 429:
                        # Overpass uses 'Retry-After' header (in seconds)
                        retry_after = int(response.headers.get("Retry-After", 60))
                        self.logger.warning(
                            f"  ⚠ Rate limited (429). Server says wait {retry_after}s. "
                            f"Sleeping..."
                        )
                        time.sleep(retry_after + 2)  # +2s safety margin
                        continue  # Retry without counting as a failed attempt
                    
                    response.raise_for_status()
                    data = response.json()
                    
                    element_count = len(data.get("elements", []))
                    self.logger.info(f"  ✓ Received {element_count} elements")
                    
                    # Cache the result
                    if use_cache and cache_key and self.cache_dir:
                        cache_path = self.cache_dir / f"{cache_key}.json"
                        save_json(data, cache_path, compact=True)
                        self.logger.info(f"  ✓ Cached to: {cache_path.name}")
                    
                    # Polite delay between successful requests
                    time.sleep(2)
                    
                    return data
                
                except requests.exceptions.Timeout:
                    self.logger.warning(f"  ⚠ Timeout on {endpoint}")
                    last_error = "timeout"
                except requests.exceptions.HTTPError as e:
                    self.logger.warning(f"  ⚠ HTTP error: {e}")
                    last_error = str(e)
                except Exception as e:
                    self.logger.warning(f"  ⚠ Error: {e}")
                    last_error = str(e)
                
                if attempt < self.max_retries:
                    self.logger.info(f"  → Waiting {self.retry_delay}s before retry...")
                    time.sleep(self.retry_delay)
            
            self.logger.warning(f"  ⚠ All retries failed for {endpoint}, trying next...")
        
        raise RuntimeError(
            f"All Overpass endpoints failed. Last error: {last_error}"
        )