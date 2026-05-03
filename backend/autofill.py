"""
autofill.py
Playwright-based form autofiller for Greenhouse, Lever, and Ashby job applications.

What it does:
  1. Opens the job application URL in a VISIBLE browser window
  2. Detects which ATS platform it is (Greenhouse / Lever / Ashby / generic)
  3. Fills all standard fields: name, email, phone, LinkedIn, GitHub, address
  4. Uploads the resume PDF to the file input
  5. Pastes cover letter text into the cover letter textarea (if present)
  6. STOPS — leaves the browser open for the user to review and click Submit

What it does NOT do:
  - Click the final Submit / Apply button (user does this manually)
  - Handle CAPTCHA or login walls
  - Guarantee 100% form coverage (custom fields vary per company)
"""

import asyncio
from pathlib import Path
from typing import Optional


# ── Field selectors per platform ─────────────────────────────────────────────

# Each entry: (css_selector, field_type)
# field_type: "text" | "email" | "tel" | "file" | "textarea"

GREENHOUSE_SELECTORS = {
    "first_name": ("#first_name", "text"),
    "last_name": ("#last_name", "text"),
    "email": ("#email", "email"),
    "phone": ("#phone", "tel"),
    "resume": ("input[type='file']", "file"),
    "cover_letter_text": ("textarea[name*='cover'], textarea[id*='cover']", "textarea"),
    "linkedin": ("input[name*='linkedin'], input[id*='linkedin']", "text"),
    "github": ("input[name*='github'], input[id*='github']", "text"),
    "website": (
        "input[name*='website'], input[id*='website'], input[name*='portfolio']",
        "text",
    ),
    "address": ("input[name*='address'], input[id*='address']", "text"),
}

LEVER_SELECTORS = {
    "full_name": ("input[name='name']", "text"),
    "email": ("input[name='email']", "email"),
    "phone": ("input[name='phone']", "tel"),
    "org": ("input[name='org']", "text"),  # current company
    "resume": ("input[type='file']", "file"),
    "cover_letter_text": ("textarea[name='comments']", "textarea"),
    "linkedin": ("input[name*='linkedin']", "text"),
    "github": ("input[name*='github']", "text"),
    "website": ("input[name*='website'], input[name*='portfolio']", "text"),
}

ASHBY_SELECTORS = {
    "first_name": ("input[name='_systemfield_name_first']", "text"),
    "last_name": ("input[name='_systemfield_name_last']", "text"),
    "email": ("input[name='_systemfield_email']", "email"),
    "phone": ("input[name='_systemfield_phone']", "tel"),
    "resume": ("input[type='file']", "file"),
    "cover_letter_text": ("textarea[name*='cover']", "textarea"),
    "linkedin": ("input[name*='linkedin']", "text"),
    "github": ("input[name*='github']", "text"),
}

GENERIC_SELECTORS = {
    "first_name": (
        "input[name*='first'], input[id*='first_name'], input[placeholder*='First']",
        "text",
    ),
    "last_name": (
        "input[name*='last'], input[id*='last_name'], input[placeholder*='Last']",
        "text",
    ),
    "email": ("input[type='email'], input[name*='email']", "email"),
    "phone": ("input[type='tel'], input[name*='phone']", "tel"),
    "resume": (
        "input[type='file'][accept*='pdf'], input[type='file'][accept*='doc'], input[type='file']",
        "file",
    ),
    "cover_letter_text": (
        "textarea[name*='cover'], textarea[id*='cover'], textarea[placeholder*='cover']",
        "textarea",
    ),
    "linkedin": ("input[name*='linkedin'], input[placeholder*='LinkedIn']", "text"),
    "github": ("input[name*='github'], input[placeholder*='GitHub']", "text"),
}


def _detect_platform(url: str) -> str:
    if "greenhouse.io" in url or "boards.greenhouse" in url:
        return "greenhouse"
    if "lever.co" in url:
        return "lever"
    if "ashbyhq.com" in url or "jobs.ashby" in url:
        return "ashby"
    return "generic"


def _get_selectors(platform: str) -> dict:
    return {
        "greenhouse": GREENHOUSE_SELECTORS,
        "lever": LEVER_SELECTORS,
        "ashby": ASHBY_SELECTORS,
    }.get(platform, GENERIC_SELECTORS)


# ── Core autofill logic ───────────────────────────────────────────────────────


async def _fill_field(page, selector: str, value: str, field_type: str):
    """Try each comma-separated selector until one is found and filled."""
    if not value:
        return False

    selectors = [s.strip() for s in selector.split(",")]
    for sel in selectors:
        try:
            locator = page.locator(sel).first
            count = await locator.count()
            if count == 0:
                continue

            if field_type == "file":
                # value must be the absolute path to the file
                if Path(value).exists():
                    await locator.set_input_files(value)
                    return True
            elif field_type == "textarea":
                await locator.click()
                await locator.fill(value)
                return True
            else:
                await locator.click()
                await locator.fill(value)
                return True
        except Exception:
            continue
    return False


async def autofill_application(
    job_url: str,
    resume_pdf_path: str,
    cover_letter_text: str,
    user_info: dict,
    headless: bool = False,
) -> dict:
    """
    Open job URL in a browser, fill all detected fields, leave open for user review.

    Args:
        job_url:            Direct application URL (Greenhouse / Lever / Ashby)
        resume_pdf_path:    Absolute path to the generated resume PDF
        cover_letter_text:  Plain text cover letter (pasted into textarea if found)
        user_info:          Dict with: name, email, phone, linkedin_url, github_url,
                            address (optional), current_company (optional)
        headless:           False = visible browser (default, so user can review)

    Returns:
        {
            "success": bool,
            "platform": str,
            "fields_filled": [str, ...],
            "fields_skipped": [str, ...],
            "error": str | None,
        }
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {
            "success": False,
            "platform": "unknown",
            "fields_filled": [],
            "fields_skipped": [],
            "error": "Playwright not installed. Run: pip install playwright && playwright install chromium",
        }

    platform = _detect_platform(job_url)
    selectors = _get_selectors(platform)

    # Split name into first/last
    name = user_info.get("name", "")
    name_parts = name.strip().split()
    first_name = name_parts[0] if name_parts else ""
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

    # Build field values map
    field_values = {
        "first_name": first_name,
        "last_name": last_name,
        "full_name": name,
        "email": user_info.get("email", ""),
        "phone": user_info.get("phone", ""),
        "linkedin": user_info.get("linkedin_url", ""),
        "github": user_info.get("github_url", ""),
        "website": user_info.get("website", user_info.get("linkedin_url", "")),
        "address": user_info.get("address", ""),
        "org": user_info.get("current_company", ""),
        "resume": resume_pdf_path,
        "cover_letter_text": cover_letter_text,
    }

    fields_filled = []
    fields_skipped = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless, slow_mo=100)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            await page.goto(job_url, wait_until="domcontentloaded", timeout=30000)
            # Wait a bit for JS to render the form
            await asyncio.sleep(2)

            for field_name, (selector, field_type) in selectors.items():
                value = field_values.get(field_name, "")
                if not value:
                    fields_skipped.append(field_name)
                    continue

                filled = await _fill_field(page, selector, value, field_type)
                if filled:
                    fields_filled.append(field_name)
                else:
                    fields_skipped.append(field_name)

            print(
                f"\n[AutoFill] Done! {len(fields_filled)} fields filled.\n"
                f"Fields filled:   {fields_filled}\n"
                f"Fields skipped:  {fields_skipped}\n"
                f"Review the form in the browser window and click Apply when ready.\n"
                f"The browser will stay open until you close it.\n"
            )

            # Return result immediately — browser stays open in background
            # We detach the context so the browser keeps running after we return
            result = {
                "success": True,
                "platform": platform,
                "fields_filled": fields_filled,
                "fields_skipped": fields_skipped,
                "error": None,
            }

            # Keep browser alive in a background task (non-blocking)
            # Browser will close when the user closes the window or after 10 min
            async def _keep_alive():
                try:
                    await asyncio.sleep(600)
                except Exception:
                    pass
                finally:
                    try:
                        await browser.close()
                    except Exception:
                        pass

            asyncio.ensure_future(_keep_alive())
            return result

        except Exception as e:
            try:
                await browser.close()
            except Exception:
                pass
            return {
                "success": False,
                "platform": platform,
                "fields_filled": fields_filled,
                "fields_skipped": fields_skipped,
                "error": str(e),
            }

    # Fallback (should not reach here)
    return {
        "success": False,
        "platform": platform,
        "fields_filled": fields_filled,
        "fields_skipped": fields_skipped,
        "error": "Unknown error",
    }


def run_autofill(
    job_url: str,
    resume_pdf_path: str,
    cover_letter_text: str,
    user_info: dict,
) -> dict:
    """Synchronous wrapper — runs the async autofill in a new event loop."""
    return asyncio.run(
        autofill_application(
            job_url=job_url,
            resume_pdf_path=resume_pdf_path,
            cover_letter_text=cover_letter_text,
            user_info=user_info,
            headless=False,
        )
    )
