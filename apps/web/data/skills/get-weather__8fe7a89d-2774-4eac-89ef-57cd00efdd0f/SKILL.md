---
name: get-weather
description: Fetch real-time weather information for specified cities including temperature, humidity, wind speed, and conditions. Use when asked about current weather, temperature, humidity, or wind conditions for any city.
---

# Get Weather

## Goal
Solve the repeated need for users to query weather information for different cities by calling weather APIs, formatting output, and avoiding manual API handling.

## Workflow
1. **Input Validation**: Validate city name and check API key configuration
2. **API Call**: Call weather API to get real-time weather data for specified city
3. **Data Processing**: Parse API response and extract key weather information
4. **Output Formatting**: Format weather data into user-friendly output
5. **Error Handling**: Handle API errors, invalid city names, network timeouts

## Decision Tree
- If city name is valid and API key configured → Execute `scripts/fetch_weather.py`
- If city name is invalid or unrecognized → Read `references/city_mapping.md` for correct name
- If API call fails → Check `references/error_codes.md` and try fallback
- If special format output needed → Use `scripts/format_output.py` for custom formatting

## Constraints
- Must validate city name effectiveness
- API calls must have timeout settings (default 30 seconds)
- Must handle API error codes
- Sensitive information (API keys) must not appear in output
- Weather data must have timestamps to avoid providing outdated information

## Validation
- **Required Checks**:
  - City name is not empty and length is reasonable
  - API response status code is 200
  - Return data contains required fields (temperature, humidity, weather conditions)
  - Output format meets expectations
  
- **Success Criteria**:
  - Successfully obtain and return weather information for specified city
  - Information is accurate and format is clear and readable
  - Error situations have clear error prompts
  
- **First Failure Checks**:
  - Check network connection
  - Verify API key validity
  - Confirm city name is within service coverage

## Resources
- `scripts/fetch_weather.py`: Core API call script for weather data acquisition
- `scripts/validate_city.py`: City name validation script for input validation
- `scripts/format_output.py`: Output formatting script for user-friendly weather reports
- `references/api_documentation.md`: Weather API documentation with parameter descriptions and limitations
- `references/city_mapping.md`: City name mapping table for common city name variants
- `references/error_codes.md`: API error code explanations for troubleshooting
