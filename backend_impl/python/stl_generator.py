import math
import json
import sys
import os
import random

# -------------------------- 核心参数配置 --------------------------
PROFILE_TYPE = "SEMI_CIRCLE"
OUTER_RADIUS = 1.0
LENGTH = 10.0
SLOPE_ANGLE = 15.0
INITIAL_THICKNESS = 0.5
N = 32
M = 16
NUM_STEPS = 10
MIN_THICKNESS_RATIO = 0.1  # 最小厚度为初始厚度的10%


def create_2d_profile(profile_type, outer_radius, n_nodes):
    vertices = []
    if profile_type == "SEMI_CIRCLE":
        for i in range(n_nodes + 1):
            angle = math.pi * i / n_nodes
            x = outer_radius * math.cos(angle)
            z = -outer_radius * math.sin(angle)
            vertices.append((x, 0.0, z))
    return vertices


def extrude_profile_to_3d(profile_vertices, length, m_segments):
    step_length = length / m_segments
    extruded_vertices = []
    layer_indices = []
    for layer in range(m_segments + 1):
        layer_start = len(extruded_vertices)
        current_y = layer * step_length
        for (x, y, z) in profile_vertices:
            extruded_vertices.append((x, current_y, z))
        layer_end = len(extruded_vertices)
        layer_indices.append((layer_start, layer_end))
    return extruded_vertices, layer_indices, step_length


def generate_inner_surface(outer_vertices, layer_indices, thickness_matrix, n_nodes, m_segments):
    inner_vertices = []
    for layer in range(m_segments + 1):
        start_idx, end_idx = layer_indices[layer]
        layer_vertices = outer_vertices[start_idx:end_idx]
        for idx_in_layer, (x, y, z) in enumerate(layer_vertices):
            thickness = thickness_matrix[idx_in_layer % (n_nodes + 1)][layer]
            dx = 0 - x
            dz = 0 - z
            norm = math.sqrt(dx**2 + dz**2)
            if norm == 0:
                nx, nz = 0, 1
            else:
                nx, nz = dx/norm, dz/norm
            inner_x = x + nx * thickness
            inner_y = y
            inner_z = z + nz * thickness
            inner_vertices.append((inner_x, inner_y, inner_z))
    return inner_vertices


def create_mesh_faces(outer_vertices, inner_vertices, layer_indices, n_nodes, m_segments):
    total_outer = len(outer_vertices)
    all_vertices = outer_vertices + inner_vertices
    faces = []
    
    for layer in range(m_segments):
        start_curr, end_curr = layer_indices[layer]
        start_next, end_next = layer_indices[layer+1]
        for i in range(end_curr - start_curr - 1):
            v1 = start_curr + i
            v2 = start_curr + i + 1
            v3 = start_next + i + 1
            v4 = start_next + i
            faces.append((v1, v2, v3))
            faces.append((v1, v3, v4))
    
    inner_start = total_outer
    for layer in range(m_segments):
        start_curr, end_curr = layer_indices[layer]
        start_inner_curr = inner_start + start_curr
        start_inner_next = inner_start + layer_indices[layer+1][0]
        for i in range(end_curr - start_curr - 1):
            v1 = start_inner_curr + i
            v2 = start_inner_next + i
            v3 = start_inner_next + i + 1
            v4 = start_inner_curr + i + 1
            faces.append((v1, v2, v3))
            faces.append((v1, v3, v4))
    
    for layer in range(m_segments + 1):
        start_outer, end_outer = layer_indices[layer]
        start_inner = inner_start + start_outer
        for i in range(end_outer - start_outer - 1):
            v1 = start_outer + i
            v2 = start_outer + i + 1
            v3 = start_inner + i + 1
            v4 = start_inner + i
            faces.append((v1, v2, v3))
            faces.append((v1, v3, v4))
    
    start_0, end_0 = layer_indices[0]
    start_inner_0 = inner_start + start_0
    faces.append((start_0, start_inner_0, end_0 - 1))
    faces.append((end_0 - 1, start_inner_0, inner_start + end_0 - 1))
    
    start_last, end_last = layer_indices[-1]
    start_inner_last = inner_start + start_last
    faces.append((start_last, end_last - 1, start_inner_last))
    faces.append((end_last - 1, inner_start + end_last - 1, start_inner_last))
    
    return all_vertices, faces


def apply_slope_rotation(vertices, slope_angle):
    slope_rad = math.radians(slope_angle)
    rotated_vertices = []
    for v in vertices:
        x, y, z = v
        new_x = x
        new_y = y * math.cos(slope_rad) - z * math.sin(slope_rad)
        new_z = y * math.sin(slope_rad) + z * math.cos(slope_rad)
        rotated_vertices.append((new_x, new_y, new_z))
    return rotated_vertices


def initialize_random_decay_rates(n_nodes, m_segments, min_ratio, num_steps):
    """为每个点初始化随机衰减速率"""
    min_thickness = INITIAL_THICKNESS * min_ratio
    decay_rates = []
    for _ in range(n_nodes + 1):
        layer_rates = []
        for _ in range(m_segments + 1):
            decay_range = (INITIAL_THICKNESS - min_thickness) / (num_steps - 1)
            random_rate = random.uniform(0.1 * decay_range, 2.0 * decay_range)
            layer_rates.append(random_rate)
        decay_rates.append(layer_rates)
    return decay_rates


def generate_decay_thickness_matrix(step, num_steps, n_nodes, m_segments, initial_thickness, min_ratio, current_thickness, decay_rates):
    min_thickness = initial_thickness * min_ratio
    thickness_matrix = []
    
    for i in range(n_nodes + 1):
        layer_thickness = []
        for j in range(m_segments + 1):
            current_t = current_thickness[i][j]
            decay_rate = decay_rates[i][j]
            
            new_t = current_t - decay_rate
            if new_t < min_thickness:
                new_t = min_thickness
            
            layer_thickness.append(new_t)
        thickness_matrix.append(layer_thickness)
    
    return thickness_matrix


def generate_stl_geometry(thickness_matrix):
    profile_verts = create_2d_profile(PROFILE_TYPE, OUTER_RADIUS, N)
    outer_verts, layer_indices, _ = extrude_profile_to_3d(profile_verts, LENGTH, M)
    inner_verts = generate_inner_surface(outer_verts, layer_indices, thickness_matrix, N, M)
    gutter_verts, gutter_faces = create_mesh_faces(outer_verts, inner_verts, layer_indices, N, M)
    rotated_gutter_verts = apply_slope_rotation(gutter_verts, SLOPE_ANGLE)
    return rotated_gutter_verts, gutter_faces


def vertices_to_array(vertices):
    return [list(v) for v in vertices]


def faces_to_array(faces):
    return [list(f) for f in faces]


def generate_animation_frames():
    frames = []
    decay_rates = initialize_random_decay_rates(N, M, MIN_THICKNESS_RATIO, NUM_STEPS)
    current_thickness = [[INITIAL_THICKNESS for _ in range(M + 1)] for _ in range(N + 1)]
    
    for step in range(NUM_STEPS):
        if step == 0:
            thickness_matrix = current_thickness
        else:
            thickness_matrix = generate_decay_thickness_matrix(
                step, NUM_STEPS, N, M, INITIAL_THICKNESS, MIN_THICKNESS_RATIO, current_thickness, decay_rates
            )
        
        vertices, faces = generate_stl_geometry(thickness_matrix)
        frames.append({
            'step': step,
            'vertices': vertices_to_array(vertices),
            'faces': faces_to_array(faces),
            'thickness_matrix': thickness_matrix
        })
        
        current_thickness = thickness_matrix
    
    return frames


def export_stl_manual(gutter_verts, gutter_faces, export_path):
    """手动导出STL文件"""
    os.makedirs(os.path.dirname(export_path), exist_ok=True)
    
    with open(export_path, 'w') as f:
        f.write("solid IronGutter\n")
        for face in gutter_faces:
            if len(face) != 3:
                continue
            v1 = gutter_verts[face[0]]
            v2 = gutter_verts[face[1]]
            v3 = gutter_verts[face[2]]
            vec1 = (v2[0]-v1[0], v2[1]-v1[1], v2[2]-v1[2])
            vec2 = (v3[0]-v1[0], v3[1]-v1[1], v3[2]-v1[2])
            normal = (
                vec1[1]*vec2[2] - vec1[2]*vec2[1],
                vec1[2]*vec2[0] - vec1[0]*vec2[2],
                vec1[0]*vec2[1] - vec1[1]*vec2[0]
            )
            norm = math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2)
            if norm == 0:
                normal = (0.0, 0.0, 1.0)
            else:
                normal = (normal[0]/norm, normal[1]/norm, normal[2]/norm)
            f.write(f"facet normal {normal[0]:.6f} {normal[1]:.6f} {normal[2]:.6f}\n")
            f.write("    outer loop\n")
            f.write(f"        vertex {v1[0]:.6f} {v1[1]:.6f} {v1[2]:.6f}\n")
            f.write(f"        vertex {v2[0]:.6f} {v2[1]:.6f} {v2[2]:.6f}\n")
            f.write(f"        vertex {v3[0]:.6f} {v3[1]:.6f} {v3[2]:.6f}\n")
            f.write("    endloop\n")
            f.write("endfacet\n")
        f.write("endsolid IronGutter\n")
    
    if not os.path.exists(export_path):
        raise RuntimeError("STL导出失败")


def generate_static_gutter():
    """生成静态Gutter几何"""
    thickness_matrix = [[INITIAL_THICKNESS for _ in range(M + 1)] for _ in range(N + 1)]
    vertices, faces = generate_stl_geometry(thickness_matrix)
    
    return {
        'vertices': vertices_to_array(vertices),
        'faces': faces_to_array(faces)
    }


if __name__ == "__main__":
    try:
        mode = sys.argv[1] if len(sys.argv) > 1 else "animation"
        
        if mode == "static":
            static_data = generate_static_gutter()
            print(json.dumps({
                'success': True,
                'type': 'static',
                'data': static_data
            }))
        else:
            frames = generate_animation_frames()
            print(json.dumps({
                'success': True,
                'type': 'animation',
                'frames': frames,
                'num_steps': NUM_STEPS,
                'initial_thickness': INITIAL_THICKNESS,
                'min_thickness_ratio': MIN_THICKNESS_RATIO
            }))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))
        sys.exit(1)
