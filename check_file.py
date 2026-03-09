import sys
path = r"d:\ARQUIVOS\SAAS\src\pages\ProductForm.tsx"
with open(path, "rb") as f:
    data = f.read()
    print(f"File size: {len(data)}")
    # Find some problematic area
    # Let's search for "costWithWaste"
    pos = data.find(b"costWithWaste")
    if pos != -1:
        print(f"Found costWithWaste at byte {pos}")
        print(f"Snippet: {data[pos:pos+500].decode('utf-8', errors='replace')}")
    else:
        print("costWithWaste NOT FOUND")
