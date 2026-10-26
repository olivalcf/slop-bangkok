[out:json][timeout:90][bbox:13.700,100.475,13.775,100.585];
(
  way[highway~"^(primary|secondary|tertiary|residential|unclassified|living_street|trunk)$"];
  way[building];
  way[natural=water];
  way[waterway=river];
  way[leisure=park];
  way[railway~"^(rail|subway|light_rail)$"][bridge~"^(yes|viaduct)$"];
  node[railway=station][network=BTS];
  node[railway=station]["operator:en"~"BTSC"];
);
out tags geom;
