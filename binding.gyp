{
  "targets": [
    {
      "target_name": "native",
      "sources": [ "src/module.cc" ],
      "include_dirs": [ '<!(node -e "require(\'nan\')")' ],
      "conditions": [
        ["OS=='linux'", {
          "defines": [ "_GNU_SOURCE" ],
          "cflags": [ "-g", "-O2", "-std=c++11", ],
        }],
      ],
    },
    {
      "target_name": "install",
      "type":"none",
      "dependencies" : [ "native" ],
      "copies": [
        {
          "destination": "<(module_root_dir)",
          "files": ["<(PRODUCT_DIR)/native.node"]
        }]
    },
  ],
}

