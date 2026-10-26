"""Fetch the bounded central-Bangkok snapshot from the public OSM map API.

Use when Overpass is unavailable. Each small tile stays below the API's node
limit. Responses are cached outside the repository; only filtered ways remain.
"""
import concurrent.futures
import json
import pathlib
import time
import urllib.request
import xml.etree.ElementTree as ET

CACHE = pathlib.Path('/tmp/slop-bangkok-osm')
CACHE.mkdir(exist_ok=True)
ROADS = {'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'trunk'}

def tile(bounds):
    west, south, east, north = bounds
    path = CACHE / ('-'.join(f'{v:.4f}' for v in bounds) + '.osm')
    if not path.exists():
        url = 'https://api.openstreetmap.org/api/0.6/map?bbox=' + ','.join(f'{v:.4f}' for v in bounds)
        req = urllib.request.Request(url, headers={'User-Agent': 'SlopBangkok/1.0 (public city simulation remix)'})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()
        path.write_bytes(data)
    root = ET.parse(path).getroot()
    nodes = {n.attrib['id']: {'lat': float(n.attrib['lat']), 'lon': float(n.attrib['lon'])} for n in root.findall('node')}
    ways = []
    for n in root.findall('node'):
        tags = {t.attrib['k']: t.attrib['v'] for t in n.findall('tag')}
        if tags.get('railway') == 'station' and (tags.get('network') == 'BTS' or 'BTSC' in tags.get('operator:en', '')):
            ways.append({'type': 'node', 'id': int(n.attrib['id']), 'tags': tags, 'geometry': [nodes[n.attrib['id']]]})
    for w in root.findall('way'):
        tags = {t.attrib['k']: t.attrib['v'] for t in w.findall('tag')}
        if not (tags.get('highway') in ROADS or 'building' in tags or tags.get('natural') == 'water'
                or tags.get('waterway') == 'river' or tags.get('leisure') == 'park'
                or tags.get('railway') in {'rail', 'subway', 'light_rail'} and tags.get('bridge') in {'yes', 'viaduct'}):
            continue
        refs = [n.attrib['ref'] for n in w.findall('nd')]
        if all(ref in nodes for ref in refs):
            ways.append({'type': 'way', 'id': int(w.attrib['id']), 'tags': tags, 'geometry': [nodes[ref] for ref in refs]})
    return ways

if __name__ == '__main__':
    tiles = [(100.475 + x * .01, 13.700 + z * .01,
              min(100.585, 100.485 + x * .01), min(13.775, 13.710 + z * .01))
             for x in range(11) for z in range(8)]
    ways = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(tile, bounds): bounds for bounds in tiles}
        for i, future in enumerate(concurrent.futures.as_completed(futures), 1):
            bounds = futures[future]
            try:
                result = future.result()
            except Exception as error:
                print(f'Retrying {bounds}: {error}', flush=True)
                time.sleep(2)
                result = tile(bounds)
            ways.update(((w['type'], w['id']), w) for w in result)
            if i % 10 == 0: print(f'{i}/{len(tiles)} tiles, {len(ways)} ways', flush=True)
    out = pathlib.Path(__file__).parent / 'data/osm_bangkok.json'
    out.write_text(json.dumps({'osm3s': {'timestamp_osm_base': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, 'elements': list(ways.values())}, separators=(',', ':')))
    print(f'Saved {len(ways)} ways to {out}', flush=True)
