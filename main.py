"""
=============================================================================
IMDb Top 250 Movie Rating Scraper
=============================================================================
Description:
    An automated web scraper built using Python, Selenium, and pandas to
    extract movie data (Rank, Title, Release Year, IMDb Rating, Duration,
    Certificate, Vote Count, and URL) from IMDb's Top 250 Movies chart.
    
    The collected data is structured into a clean pandas DataFrame, 
    statistically summarized, and exported to a CSV file.

Author: Antigravity Assistant & Student Developer
License: MIT
=============================================================================
"""

import os
import re
import sys
import time
import logging
import argparse
from datetime import datetime
from typing import List, Dict, Any, Optional

import pandas as pd
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException

# Try importing webdriver-manager; fallback to Selenium's native manager if unavailable
try:
    from webdriver_manager.chrome import ChromeDriverManager
    HAS_WEBDRIVER_MANAGER = True
except ImportError:
    HAS_WEBDRIVER_MANAGER = False

# Ensure UTF-8 output encoding across Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("IMDbScraper")


# ---------------------------------------------------------------------------
# Browser Initialization
# ---------------------------------------------------------------------------
def setup_driver(headless: bool = True) -> webdriver.Chrome:
    """
    Initializes and configures the Chrome WebDriver with anti-bot detection
    bypasses and optimal performance arguments.
    
    Args:
        headless (bool): Whether to run Chrome without a visible window.
        
    Returns:
        webdriver.Chrome: Configured Chrome WebDriver instance.
    """
    chrome_options = Options()
    
    if headless:
        # Modern headless flag for Chrome 109+
        chrome_options.add_argument("--headless=new")
        logger.info("Running browser in HEADLESS mode (background).")
    else:
        logger.info("Running browser in VISIBLE mode (GUI window).")

    # Anti-detection & performance flags
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--log-level=3")  # Suppress internal Chrome logs
    
    # Realistic User-Agent and headers
    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
    chrome_options.add_argument(f"user-agent={user_agent}")
    chrome_options.add_argument("--accept-language=en-US,en;q=0.9")
    
    # Mask automation signature
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)

    # Initialize WebDriver with fallback strategy
    driver = None
    if HAS_WEBDRIVER_MANAGER:
        try:
            logger.info("Resolving ChromeDriver via webdriver-manager...")
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
        except Exception as e:
            logger.warning(f"webdriver-manager setup failed ({e}). Falling back to native Selenium manager...")

    if driver is None:
        # Fall back to Selenium 4.6+ built-in SeleniumManager
        logger.info("Using Selenium built-in Driver Manager...")
        driver = webdriver.Chrome(options=chrome_options)

    # Hide 'navigator.webdriver' via Chrome DevTools Protocol
    try:
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": """
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    });
                """
            }
        )
    except Exception as e:
        logger.debug(f"CDP stealth script setup note: {e}")

    return driver


# ---------------------------------------------------------------------------
# Data Parsing Utilities
# ---------------------------------------------------------------------------
def clean_text(text: Optional[str]) -> str:
    """Removes excess whitespace, non-breaking spaces, and newlines."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def parse_movie_element(item_soup: BeautifulSoup, default_rank: int) -> Dict[str, Any]:
    """
    Extracts individual movie attributes from a movie item container soup.
    Handles multiple selector variations to remain resilient to IMDb DOM changes.
    
    Args:
        item_soup (BeautifulSoup): Parsed HTML of a single movie list element.
        default_rank (int): Fallback ranking index if badge is missing.
        
    Returns:
        Dict[str, Any]: Dictionary containing parsed movie metadata.
    """
    # 1. Rank Extraction
    rank_elem = item_soup.select_one(
        '[data-testid="title-list-item-ranking"], .ipc-signpost__text, .cli-title-rank'
    )
    if rank_elem:
        raw_rank = clean_text(rank_elem.get_text()).replace("#", "").replace(".", "")
        try:
            rank = int(raw_rank)
        except ValueError:
            rank = default_rank
    else:
        rank = default_rank

    # 2. Title Extraction
    title_elem = item_soup.select_one(
        ".ipc-title__text, h4.ipc-title__text, h3.ipc-title__text, .cli-title a"
    )
    raw_title = clean_text(title_elem.get_text()) if title_elem else "Unknown Title"
    # Clean leading numeric prefixes like "1. The Shawshank Redemption"
    clean_title = re.sub(r"^\d+\.\s*", "", raw_title)

    # 3. IMDb Rating Extraction
    rating_elem = item_soup.select_one(
        ".ipc-rating-star--rating, span[data-testid='ratingGroup--imdb-rating'] span, .ratingGroup--imdb-rating"
    )
    if rating_elem:
        raw_rating = clean_text(rating_elem.get_text())
        # Extract numerical float value (e.g., '9.3')
        rating_match = re.search(r"\d+(\.\d+)?", raw_rating)
        rating = float(rating_match.group(0)) if rating_match else None
    else:
        rating = None

    # 4. Vote Count Extraction
    vote_elem = item_soup.select_one(".ipc-rating-star--voteCount, .ipc-rating-star__vote-count")
    if vote_elem:
        raw_votes = clean_text(vote_elem.get_text()).replace("(", "").replace(")", "").replace("\xa0", "")
        vote_count = raw_votes
    else:
        vote_count = "N/A"

    # 5. Metadata Items (Year, Duration, Content Certificate)
    meta_spans = item_soup.select(
        "div.cli-title-metadata li.ipc-inline-list__item, span.cli-title-metadata-item"
    )
    meta_texts = [clean_text(s.get_text()) for s in meta_spans if clean_text(s.get_text())]

    release_year = None
    duration = "N/A"
    content_rating = "Unrated"

    for idx, text in enumerate(meta_texts):
        # Identify 4-digit release year
        if re.match(r"^(19\d\d|20\d\d)$", text) and release_year is None:
            release_year = int(text)
        elif ("h" in text or "m" in text) and any(c.isdigit() for c in text):
            duration = text
        elif idx == 2 or text in ["G", "PG", "PG-13", "R", "NC-17", "Approved", "Passed", "TV-MA", "Not Rated"]:
            content_rating = text

    # Fallback to position 0 if release_year was not matched
    if release_year is None and len(meta_texts) > 0 and meta_texts[0].isdigit():
        release_year = int(meta_texts[0])

    # 6. Movie URL
    link_elem = item_soup.select_one("a.ipc-title-link-wrapper, a.ipc-lockup-overlay")
    if link_elem and link_elem.get("href"):
        clean_path = link_elem["href"].split("?")[0]
        movie_url = f"https://www.imdb.com{clean_path}"
    else:
        movie_url = "N/A"

    return {
        "Rank": rank,
        "Title": clean_title,
        "Release_Year": release_year if release_year else "N/A",
        "IMDb_Rating": rating if rating is not None else "N/A",
        "Duration": duration,
        "Content_Rating": content_rating,
        "Vote_Count": vote_count,
        "URL": movie_url,
        "Scraped_At": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


def fetch_movie_deep_details(driver: webdriver.Chrome, url: str) -> Dict[str, str]:
    """
    Visits an individual movie page to extract additional details:
    Director(s), Genre(s), and Top Cast.
    
    Args:
        driver (webdriver.Chrome): Active Selenium WebDriver.
        url (str): Movie detail URL.
        
    Returns:
        Dict[str, str]: Dictionary containing Director, Cast, and Genres.
    """
    details = {
        "Director": "N/A",
        "Genres": "N/A",
        "Cast": "N/A"
    }
    
    if not url or url == "N/A":
        return details

    try:
        driver.get(url)
        # Short polite pause
        time.sleep(1.2)
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # 1. Genres
        genre_chips = soup.select('div[data-testid="genres"] a, a.ipc-chip--on-baseAlt')
        if genre_chips:
            genres = [clean_text(g.get_text()) for g in genre_chips if clean_text(g.get_text())]
            details["Genres"] = ", ".join(list(dict.fromkeys(genres))[:4])

        # 2. Directors
        director_items = soup.select('li[data-testid="title-pc-principal-credit"]:has(span:contains("Director")) a, '
                                    'li[data-testid="title-pc-principal-credit"]:nth-of-type(1) a')
        directors = [clean_text(d.get_text()) for d in director_items if "/name/" in d.get("href", "")]
        if directors:
            details["Director"] = ", ".join(list(dict.fromkeys(directors)))

        # 3. Top Cast
        cast_items = soup.select('a[data-testid="title-cast-item__actor"]')
        if cast_items:
            actors = [clean_text(a.get_text()) for a in cast_items[:3]]
            details["Cast"] = ", ".join(actors)

    except Exception as e:
        logger.warning(f"Could not fetch extra details for {url}: {e}")

    return details


# ---------------------------------------------------------------------------
# Core Scraping Orchestrator
# ---------------------------------------------------------------------------
def scrape_imdb_top_movies(
    limit: int = 250,
    headless: bool = True,
    deep_scrape: bool = False
) -> pd.DataFrame:
    """
    Main scraping controller that navigates to IMDb Top 250, extracts movie records,
    and returns a structured pandas DataFrame.
    
    Args:
        limit (int): Number of top movies to scrape (1 to 250).
        headless (bool): Enable or disable headless browser execution.
        deep_scrape (bool): If True, navigates to individual movie pages for extra details.
        
    Returns:
        pd.DataFrame: Formatted pandas DataFrame containing scraped records.
    """
    target_url = "https://www.imdb.com/chart/top/"
    movies_data: List[Dict[str, Any]] = []

    logger.info(f"Targeting URL: {target_url}")
    logger.info(f"Scrape limit: {limit} movies")

    driver = setup_driver(headless=headless)
    try:
        logger.info("Opening IMDb Top 250 page...")
        driver.get(target_url)

        # Explicit Wait for the movie list container to render
        logger.info("Waiting for page elements to render (Explicit Wait)...")
        wait = WebDriverWait(driver, 20)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "ul.ipc-metadata-list")))
        logger.info("Movie list rendered successfully.")

        # Brief delay to allow full client-side hydration
        time.sleep(2)

        # Parse rendered page with BeautifulSoup
        soup = BeautifulSoup(driver.page_source, "html.parser")
        items = soup.select("li.ipc-metadata-list-summary-item")

        total_found = len(items)
        logger.info(f"Found {total_found} movie entries on the page.")

        if total_found == 0:
            logger.error("No movies found. IMDb might have updated its layout or blocked the request.")
            return pd.DataFrame()

        # Enforce user-specified limit
        target_items = items[:min(limit, total_found)]
        logger.info(f"Extracting metadata for {len(target_items)} movies...")

        for idx, item in enumerate(target_items, start=1):
            movie_record = parse_movie_element(item, default_rank=idx)
            movies_data.append(movie_record)
            
            # Progress update every 25 records or for small limits
            if idx % 25 == 0 or idx == len(target_items):
                logger.info(f"Progress: [{idx}/{len(target_items)}] extracted: '{movie_record['Title']}'")

        # Optional Deep Scraping for genres/directors/cast
        if deep_scrape and movies_data:
            deep_count = min(len(movies_data), 10)  # Safe default to avoid rate limiting
            logger.info(f"Deep scraping enabled! Extracting director and cast for top {deep_count} movies...")
            for idx in range(deep_count):
                movie = movies_data[idx]
                logger.info(f"Fetching details [{idx+1}/{deep_count}] for: {movie['Title']}")
                extra_info = fetch_movie_deep_details(driver, movie["URL"])
                movie.update(extra_info)

    except TimeoutException:
        logger.error("Timed out waiting for IMDb page elements to load. Please check your internet connection.")
    except WebDriverException as e:
        logger.error(f"WebDriver exception occurred: {e}")
    except Exception as e:
        logger.error(f"Unexpected error during scraping: {e}", exc_info=True)
    finally:
        logger.info("Safely terminating Chrome WebDriver instance...")
        driver.quit()

    # Convert collected list of dictionaries to pandas DataFrame
    df = pd.DataFrame(movies_data)
    return df


# ---------------------------------------------------------------------------
# Statistical Summary
# ---------------------------------------------------------------------------
def display_statistics(df: pd.DataFrame) -> None:
    """
    Calculates and prints statistical summaries from the scraped movie dataset.
    
    Args:
        df (pd.DataFrame): The scraped movies DataFrame.
    """
    if df.empty:
        logger.warning("DataFrame is empty. No statistics to display.")
        return

    print("\n" + "=" * 65)
    print("                 IMDb TOP MOVIES SUMMARY STATISTICS          ")
    print("=" * 65)
    print(f"Total Movies Scraped : {len(df)}")

    # Clean numeric ratings for analysis
    numeric_ratings = pd.to_numeric(df["IMDb_Rating"], errors="coerce").dropna()
    numeric_years = pd.to_numeric(df["Release_Year"], errors="coerce").dropna()

    if not numeric_ratings.empty:
        highest_rating = numeric_ratings.max()
        lowest_rating = numeric_ratings.min()
        avg_rating = numeric_ratings.mean()

        highest_movie = df.loc[df["IMDb_Rating"] == highest_rating, "Title"].iloc[0]
        lowest_movie = df.loc[df["IMDb_Rating"] == lowest_rating, "Title"].iloc[0]

        print(f"Average IMDb Rating  : {avg_rating:.2f} / 10.0")
        print(f"Highest Rating       : {highest_rating} ('{highest_movie}')")
        print(f"Lowest Rating in List: {lowest_rating} ('{lowest_movie}')")

    if not numeric_years.empty:
        oldest_year = int(numeric_years.min())
        newest_year = int(numeric_years.max())
        oldest_movie = df.loc[df["Release_Year"] == oldest_year, "Title"].iloc[0]
        newest_movie = df.loc[df["Release_Year"] == newest_year, "Title"].iloc[0]

        print(f"Oldest Movie         : {oldest_year} ('{oldest_movie}')")
        print(f"Newest Movie         : {newest_year} ('{newest_movie}')")

    # Content Rating Breakdown
    if "Content_Rating" in df.columns:
        print("\n--- Content Rating Distribution (Top 5) ---")
        rating_counts = df["Content_Rating"].value_counts().head(5)
        for cat, cnt in rating_counts.items():
            print(f"  * {cat:<12}: {cnt} movies")

    print("=" * 65 + "\n")


# ---------------------------------------------------------------------------
# Main Execution Entry Point
# ---------------------------------------------------------------------------
def main():
    """
    Command-line interface entry point.
    Parses arguments, executes scraper, prints preview, and exports CSV.
    """
    parser = argparse.ArgumentParser(
        description="IMDb Top 250 Movie Rating Scraper (Python + Selenium + pandas)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=250,
        help="Number of movies to scrape (1 to 250, default: 250)"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=True,
        help="Run Chrome in headless mode (default: True)"
    )
    parser.add_argument(
        "--no-headless",
        action="store_false",
        dest="headless",
        help="Run Chrome with a visible browser window"
    )
    parser.add_argument(
        "--deep",
        action="store_true",
        default=False,
        help="Optionally scrape Director and Cast from individual movie pages"
    )
    parser.add_argument(
        "--preview",
        type=int,
        default=50,
        help="Number of scraped movie records to preview in console (default: 50)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.join("output", "imdb_top_250_movies.csv"),
        help="Output CSV file path (default: output/imdb_top_250_movies.csv)"
    )

    args = parser.parse_args()

    # Determine project directory relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.abspath(os.path.join(script_dir, args.output))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print("\n" + "#" * 65)
    print("      === STARTING IMDb TOP 250 MOVIE RATING SCRAPER ===       ")
    print("#" * 65)
    logger.info(f"Output CSV destination: {output_path}")

    start_time = time.time()

    # Run Scraper
    df = scrape_imdb_top_movies(
        limit=args.limit,
        headless=args.headless,
        deep_scrape=args.deep
    )

    elapsed_time = time.time() - start_time

    if df.empty:
        logger.error("Scraping finished with 0 records. CSV export aborted.")
        sys.exit(1)

    # Export DataFrame to CSV
    try:
        df.to_csv(output_path, index=False, encoding="utf-8-sig")
        logger.info(f"Successfully saved {len(df)} records to: {output_path}")
    except Exception as e:
        logger.error(f"Failed to export CSV: {e}")
        sys.exit(1)

    # Display Statistical Insights
    display_statistics(df)

    # Display Preview of Scraped Records (Default: 50 movies)
    preview_count = min(max(args.preview, 1), len(df))
    print(f"\n--- Top {preview_count} Movies Preview (from {len(df)} Total Scraped) ---")
    cols_to_show = [c for c in ["Rank", "Title", "Release_Year", "IMDb_Rating", "Duration", "Content_Rating"] if c in df.columns]
    with pd.option_context("display.max_rows", preview_count + 10, "display.max_columns", None, "display.width", 1000):
        print(df[cols_to_show].head(preview_count).to_string(index=False))
    print(f"\nExecution completed successfully in {elapsed_time:.2f} seconds.")
    print(f"Full dataset containing all {len(df)} movies is saved to: {output_path}")


if __name__ == "__main__":
    main()
