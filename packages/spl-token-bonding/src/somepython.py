import json

# Read the mainnet.json file
with open('mainnet.json', 'r') as file:
    data = json.load(file)

# Filter the data
filtered_data = [
    {
        'id': item['id'],
        'baseMint': item['baseMint'],
        'quoteMint': item['quoteMint'],
        'baseVault': item.get('baseVault', ''),
        'quoteVault': item.get('quoteVault', '')
    }
    for item in data["unOfficial"]
    if item.get('baseMint') == 'So11111111111111111111111111111111111111112'
    or item.get('quoteMint') == 'So11111111111111111111111111111111111111112'
]
# Concatenate data["official"] with the filtered unofficial data
official_data = [
    {
        'id': item['id'],
        'baseMint': item['baseMint'],
        'quoteMint': item['quoteMint'],
        'baseVault': item.get('baseVault', ''),
        'quoteVault': item.get('quoteVault', '')
    }
    for item in data["official"]
    if item.get('baseMint') == 'So11111111111111111111111111111111111111112'
    or item.get('quoteMint') == 'So11111111111111111111111111111111111111112'
]

filtered_data.extend(official_data)


# Print the length of the original data and the filtered data
print(f"Original data length: {len(data['unOfficial'])}")
print(f"Filtered data length: {len(filtered_data)}")


# Optionally, save the filtered results to a new file
with open('filtered_mainnet.json', 'w') as outfile:
    json.dump(filtered_data, outfile, indent=2)
print(f"Filtered results saved to 'filtered_mainnet.json'")