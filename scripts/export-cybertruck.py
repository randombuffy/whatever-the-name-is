"""Turn Cybertruck.usdz into a glTF the pad can drive. Wheels are split out so they can spin."""
import array
import json
import struct
from pathlib import Path

from pxr import Usd, UsdGeom

ROOT = Path(__file__).resolve().parents[1]
STAGE = Usd.Stage.Open(str(ROOT / "public" / "3d" / "Cybertruck.usdz"))
BASE = "/scene/Meshes/Sketchfab_model/cybertruck_obj_cleaner_materialmerger_gles/"

BODY = {
    "Object_2/Object_0": (0.95, 0.97, 1.0, 1, 0.35, 0.15, 0),
    "Object_3/Object_1": (1.0, 0.15, 0.08, 1, 0.4, 0.1, 1),
    "Object_4/Object_2": (0.55, 0.72, 0.82, 0.45, 0.05, 0.85, 0),
    "Object_5/Object_3": (0.15, 0.18, 0.2, 0.72, 0.08, 0.6, 0),
    "Object_8/Object_6": (0.78, 0.8, 0.83, 1, 0.35, 0.72, 0),
    "Object_9/Object_7": (0.12, 0.13, 0.14, 1, 0.55, 0.35, 0),
}
WHEELS = ("Object_6/Object_4", "Object_7/Object_5")
LENGTH = 5.75


def mesh_data(path):
    mesh = UsdGeom.Mesh(STAGE.GetPrimAtPath(BASE + path))
    points = mesh.GetPointsAttr().Get()
    normals = mesh.GetNormalsAttr().Get()
    indices = mesh.GetFaceVertexIndicesAttr().Get()
    return points, normals, indices


def y_up(point, scale):
    x, y, z = point
    return (x * scale, z * scale, -y * scale)


def y_up_n(normal):
    x, y, z = normal
    return (x, z, -y)


def main():
    body_pts = []
    for path in BODY:
        points, _, _ = mesh_data(path)
        body_pts.extend(points)
    span = max(p[0] for p in body_pts) - min(p[0] for p in body_pts)
    scale = LENGTH / span

    blobs = []
    materials = []
    primitives = []

    def add_mesh(name, parts, origin=(0, 0, 0)):
        positions = []
        normals = []
        indices = []
        for path, _color in parts:
            points, norms, faces = mesh_data(path)
            base = len(positions) // 3
            for point, normal in zip(points, norms):
                x, y, z = y_up(point, scale)
                positions.extend((x - origin[0], y - origin[1], z - origin[2]))
                normals.extend(y_up_n(normal))
            indices.extend(index + base for index in faces)
        materials.append(parts[0][1] if len(parts) == 1 else (0.08, 0.08, 0.09, 1, 0.9, 0.15, 0))
        primitives.append((name, positions, normals, indices, len(materials) - 1))

    for path, color in BODY.items():
        add_mesh(path.split("/")[-1], [(path, color)])

    wheels = {key: [] for key in ("FL", "FR", "RL", "RR")}
    for path in WHEELS:
        points, norms, faces = mesh_data(path)
        for face in range(0, len(faces), 3):
            ids = faces[face:face + 3]
            cx = sum(points[i][0] for i in ids) / 3
            cy = sum(points[i][1] for i in ids) / 3
            key = ("F" if cx > 0 else "R") + ("L" if cy > 0 else "R")
            wheels[key].append((path, ids))

    wheel_nodes = []
    for key, faces in wheels.items():
        grouped = {}
        for path, ids in faces:
            grouped.setdefault(path, []).extend(ids)
        pts, _, _ = mesh_data(WHEELS[0])
        unique = set(grouped[WHEELS[0]])
        count = len(unique)
        origin = y_up((
            sum(pts[index][0] for index in unique) / count,
            sum(pts[index][1] for index in unique) / count,
            sum(pts[index][2] for index in unique) / count,
        ), scale)
        positions = []
        normals = []
        indices = []
        for path, ids in grouped.items():
            pts, nrm, _ = mesh_data(path)
            remap = {}
            for index in ids:
                if index not in remap:
                    remap[index] = len(positions) // 3
                    x, y, z = y_up(pts[index], scale)
                    positions.extend((x - origin[0], y - origin[1], z - origin[2]))
                    normals.extend(y_up_n(nrm[index]))
                indices.append(remap[index])
        materials.append((0.08, 0.08, 0.09, 1, 0.92, 0.12, 0))
        primitives.append((f"Wheel{key}", positions, normals, indices, len(materials) - 1))
        wheel_nodes.append((f"Wheel{key}", origin))

    buffer = bytearray()
    views = []
    accessors = []
    gl_meshes = []
    nodes = []

    def align():
        while len(buffer) % 4:
            buffer.append(0)

    def push(values, kind):
        align()
        start = len(buffer)
        if kind == "f":
            buffer.extend(array.array("f", values).tobytes())
            ctype, count = 5126, len(values) // 3
        else:
            buffer.extend(array.array("I", values).tobytes())
            ctype, count = 5125, len(values)
        views.append({"buffer": 0, "byteOffset": start, "byteLength": len(buffer) - start})
        accessor = {"bufferView": len(views) - 1, "componentType": ctype, "count": count}
        if kind == "f":
            accessor["type"] = "VEC3"
        else:
            accessor["type"] = "SCALAR"
        accessors.append(accessor)
        return len(accessors) - 1

    mesh_index = {}
    for name, positions, normals, indices, material in primitives:
        pos = push(positions, "f")
        accessors[pos]["min"] = [min(positions[i::3]) for i in range(3)]
        accessors[pos]["max"] = [max(positions[i::3]) for i in range(3)]
        norm = push(normals, "f")
        index = push(indices, "i")
        gl_meshes.append({
            "name": name,
            "primitives": [{
                "attributes": {"POSITION": pos, "NORMAL": norm},
                "indices": index,
                "material": material,
            }],
        })
        mesh_index[name] = len(gl_meshes) - 1

    body_children = []
    for name, *_rest in primitives:
        if name.startswith("Wheel"):
            continue
        nodes.append({"name": name, "mesh": mesh_index[name]})
        body_children.append(len(nodes) - 1)
    nodes.append({"name": "Body", "children": body_children})
    body_node = len(nodes) - 1
    wheel_ids = []
    for name, origin in wheel_nodes:
        nodes.append({
            "name": name,
            "mesh": mesh_index[name],
            "translation": list(origin),
        })
        wheel_ids.append(len(nodes) - 1)
    nodes.append({"name": "Cybertruck", "children": [body_node, *wheel_ids]})

    gltf = {
        "asset": {"version": "2.0", "generator": "astra-cybertruck"},
        "scene": 0,
        "scenes": [{"nodes": [len(nodes) - 1]}],
        "nodes": nodes,
        "meshes": gl_meshes,
        "materials": [
            {
                "name": f"mat{i}",
                "pbrMetallicRoughness": {
                    "baseColorFactor": list(color[:4]),
                    "metallicFactor": color[5],
                    "roughnessFactor": color[4],
                },
                "emissiveFactor": [color[0], color[1], color[2]] if color[6] else [0, 0, 0],
                "alphaMode": "BLEND" if color[3] < 1 else "OPAQUE",
                "doubleSided": True,
            }
            for i, color in enumerate(materials)
        ],
        "buffers": [{"byteLength": len(buffer)}],
        "bufferViews": views,
        "accessors": accessors,
    }
    text = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(text) % 4:
        text += b" "
    while len(buffer) % 4:
        buffer.append(0)
    out = ROOT / "public" / "vehicles" / "cybertruck.glb"
    with out.open("wb") as handle:
        length = 12 + 8 + len(text) + 8 + len(buffer)
        handle.write(struct.pack("<4sII", b"glTF", 2, length))
        handle.write(struct.pack("<I4s", len(text), b"JSON"))
        handle.write(text)
        handle.write(struct.pack("<I4s", len(buffer), b"BIN\0"))
        handle.write(buffer)
    print(out, out.stat().st_size)


if __name__ == "__main__":
    main()
