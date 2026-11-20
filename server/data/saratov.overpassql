[out:json][timeout:300];
(
  nwr["tourism"~"^(museum|gallery)$"](51.47,45.85,51.62,46.20);
  nwr["historic"~"^(monument|memorial)$"](51.47,45.85,51.62,46.20);
  nwr["leisure"~"^(park|garden)$"](51.47,45.85,51.62,46.20);
  nwr["tourism"="viewpoint"](51.47,45.85,51.62,46.20);
);
out center tags;