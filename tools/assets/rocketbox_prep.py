# Rocketbox -> GLB intermedio (Blender sin interfaz).
# Uso: tools/assets/blender.sh -b --python rocketbox_prep.py -- config.json
# Modos:
#   avatar: FBX del personaje -> GLB con malla, esqueleto y formas elegidas (texturas de marcador;
#           las reales las pone rocketbox.mjs). Además escribe un JSON con los triángulos UV de los ojos.
#   clip:   FBX de animación -> GLB solo con esqueleto del cuerpo y una acción (rotaciones + pelvis).
import bpy, sys, json, math, re
from mathutils import Matrix

cfg = json.load(open(sys.argv[sys.argv.index('--') + 1]))

# Huesos del cuerpo que lleva un clip (sin cara ni "Nub"): la cara la maneja el motor.
CUERPO = re.compile(r'^Bip01 (Pelvis|Spine\d?|Neck|Head|[LR] (Clavicle|UpperArm|Forearm|Hand|Finger\d+|Thigh|Calf|Foot|Toe0))$')


def importar(fbx, anim):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx, use_anim=anim)
    global escena
    escena = bpy.context.scene  # read_factory_settings reemplaza la escena
    arm = next(o for o in escena.objects if o.type == 'ARMATURE')
    return arm


def activar(objs, activo):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = activo


def aplicar_transformaciones(arm, mallas):
    # Deja el armature y las mallas con transformación identidad: metros, Z arriba (Y arriba en glTF).
    for m in mallas:
        mw = m.matrix_world.copy()
        m.parent = None
        m.matrix_world = mw
    activar([arm] + mallas, arm)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for m in mallas:
        m.parent = arm
        m.matrix_parent_inverse = Matrix.Identity(4)
        for mod in m.modifiers:
            if mod.type == 'ARMATURE':
                mod.object = arm


def exportar(salida, animaciones):
    bpy.ops.export_scene.gltf(
        filepath=salida, export_format='GLB', export_yup=True, export_apply=False,
        export_animations=animaciones, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_optimize_animation_size=False, export_anim_slide_to_zero=True, export_reset_pose_bones=True,
        export_skins=True, export_def_bones=False, export_rest_position_armature=True,
        export_morph=True, export_morph_normal=True, export_morph_tangent=False, export_try_sparse_sk=True,
        export_tangents=False, export_normals=True, export_texcoords=True, export_vertex_color='NONE',
        export_materials='EXPORT', export_image_format='AUTO', export_cameras=False, export_lights=False,
        export_extras=False)


def material_marcador(mat, nombre):
    # Material mínimo: una imagen chiquita en Base Color para que se exporten las UV.
    mat.name = nombre
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    sal = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], sal.inputs[0])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.new(nombre + '_marcador', 4, 4)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.8


def avatar():
    arm = importar(cfg['fbx'], False)
    for o in list(escena.objects):
        if o.type not in ('ARMATURE', 'MESH'):
            bpy.data.objects.remove(o)
    mallas = [o for o in escena.objects if o.type == 'MESH']
    assert len(mallas) == 1, [m.name for m in mallas]
    malla = mallas[0]
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    aplicar_transformaciones(arm, mallas)
    arm.name = 'Bip01'
    arm.data.name = 'Bip01'

    # Formas: solo las pedidas, con el nombre nuevo y en el orden pedido.
    formas = cfg.get('formas') or {}
    me = malla.data
    activar([malla], malla)
    if formas and me.shape_keys:
        origen = {v: k for k, v in formas.items()}
        faltan = [v for v in formas.values() if v not in me.shape_keys.key_blocks]
        assert not faltan, 'faltan formas: %s' % faltan
        for kb in reversed(list(me.shape_keys.key_blocks)[1:]):
            if kb.name not in origen:
                malla.shape_key_remove(kb)
        for kb in list(me.shape_keys.key_blocks)[1:]:
            kb.name = origen[kb.name]
            assert kb.relative_key == me.shape_keys.key_blocks[0]
        for nombre in formas:
            malla.active_shape_key_index = me.shape_keys.key_blocks.find(nombre)
            bpy.ops.object.shape_key_move(type='BOTTOM')
        print('FORMAS', [kb.name for kb in me.shape_keys.key_blocks])
    elif me.shape_keys:
        malla.shape_key_clear()

    # Diagnóstico: cuánto mueven las formas los vértices de materiales que no las llevan.
    partes = cfg['partes']
    destino_formas = cfg.get('formas_en')
    if formas:
        idx_mat = {i: s.material.name for i, s in enumerate(malla.material_slots)}
        vmat = {}
        for p in me.polygons:
            for v in p.vertices:
                vmat[v] = idx_mat[p.material_index]
        base = me.shape_keys.key_blocks[0].data
        for kb in list(me.shape_keys.key_blocks)[1:]:
            mx = {}
            for i, d in enumerate(kb.data):
                dl = (d.co - base[i].co).length
                pm = partes[vmat.get(i, '')] if vmat.get(i, '') in partes else '?'
                mx[pm] = max(mx.get(pm, 0), dl)
            print('DELTA', kb.name, {k: round(v * 1000, 2) for k, v in mx.items()}, 'mm')

    # Triángulos UV de los ojos (vértices pesados a los huesos de los ojos), para la máscara de brillo.
    ojos = [malla.vertex_groups[n].index for n in ('Bip01 REye', 'Bip01 LEye') if n in malla.vertex_groups]
    peso_ojo = {}
    for v in me.vertices:
        peso_ojo[v.index] = sum(g.weight for g in v.groups if g.group in ojos)
    uv = me.uv_layers.active.data
    tri_ojos = {}
    for p in me.polygons:
        if all(peso_ojo[v] >= 0.5 for v in p.vertices):
            mat = partes[malla.material_slots[p.material_index].material.name]
            pts = [(uv[li].uv[0], 1.0 - uv[li].uv[1]) for li in p.loop_indices]
            for k in range(1, len(pts) - 1):
                tri_ojos.setdefault(mat, []).append([pts[0], pts[k], pts[k + 1]])
    print('OJOS', {k: len(v) for k, v in tri_ojos.items()})

    # Una malla por material: el motor busca las formas solo en la cabeza.
    activar([malla], malla)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in [o for o in escena.objects if o.type == 'MESH']:
        usados = {p.material_index for p in o.data.polygons}
        mat = [o.material_slots[i].material for i in usados]
        assert len(mat) == 1
        nombre = partes[mat[0].name]
        activar([o], o)
        for i in reversed(range(len(o.material_slots))):
            if i not in usados:
                o.active_material_index = i
                bpy.ops.object.material_slot_remove()
        o.name = nombre
        o.data.name = nombre
        if nombre != destino_formas and o.data.shape_keys:
            o.shape_key_clear()
        print('PARTE', nombre, 'verts', len(o.data.vertices), 'caras', len(o.data.polygons),
              'formas', len(o.data.shape_keys.key_blocks) - 1 if o.data.shape_keys else 0)
    for mat in list(bpy.data.materials):
        if mat.users and mat.name in partes:
            material_marcador(mat, partes[mat.name])

    # Datos de control: altura de los pies y frente del personaje.
    pts = [o.matrix_world @ v.co for o in escena.objects if o.type == 'MESH' for v in o.data.vertices]
    print('CAJA', [round(min(p[i] for p in pts), 4) for i in range(3)], [round(max(p[i] for p in pts), 4) for i in range(3)])
    json.dump({'ojos': tri_ojos}, open(cfg['uv_json'], 'w'))
    exportar(cfg['salida'], False)


def clip():
    arm = importar(cfg['fbx'], True)
    act = arm.animation_data.action
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    huesos = [b.name for b in arm.data.bones if CUERPO.match(b.name)]
    print('CLIP', act.name, f0, f1, 'fps', escena.render.fps, 'huesos', len(huesos))
    # 1) Pose de cada hueso en el mundo, cuadro por cuadro (incluye el movimiento del objeto Bip01).
    mundo = {n: [] for n in huesos}
    for f in range(f0, f1 + 1):
        escena.frame_set(f)
        w = arm.matrix_world.copy()
        for n in huesos:
            loc, rot, _ = (w @ arm.pose.bones[n].matrix).decompose()
            mundo[n].append(Matrix.LocRotScale(loc, rot, None))
    # 2) Armature quieto con transformación identidad (metros) y solo los huesos del cuerpo.
    arm.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)  # si no, el exportador también saca la toma original
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    for o in list(escena.objects):
        if o != arm:
            bpy.data.objects.remove(o)
    arm.location = (0, 0, 0)
    arm.rotation_euler = (0, 0, -math.pi / 2)
    arm.scale = (0.01, 0.01, 0.01)
    aplicar_transformaciones(arm, [])
    activar([arm], arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in list(arm.data.edit_bones):
        if eb.name not in mundo:
            arm.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.name = 'Bip01'
    # 3) Pose local de cada hueso = la que reproduce la pose en el mundo; se guarda como acción.
    reposo = {n: arm.data.bones[n].matrix_local.copy() for n in huesos}
    padre = {n: (arm.data.bones[n].parent.name if arm.data.bones[n].parent else None) for n in huesos}
    accion = bpy.data.actions.new(cfg['nombre'])
    total = f1 - f0 + 1
    for n in huesos:
        pb = arm.pose.bones[n]
        pb.rotation_mode = 'QUATERNION'
        quats, locs, prev = [], [], None
        for i in range(total):
            if padre[n]:
                rel = reposo[padre[n]].inverted() @ reposo[n]
                base = rel.inverted() @ (mundo[padre[n]][i].inverted() @ mundo[n][i])
            else:
                base = reposo[n].inverted() @ mundo[n][i]
            loc, q, _ = base.decompose()
            if prev is not None and prev.dot(q) < 0:
                q.negate()
            prev = q
            quats.append(q)
            locs.append(loc)
        canales = [('rotation_quaternion', 4, quats)]
        if padre[n] is None:
            canales.append(('location', 3, locs))
        for prop, nc, vals in canales:
            for k in range(nc):
                fc = accion.fcurves.new('pose.bones["%s"].%s' % (n, prop), index=k, action_group=n)
                fc.keyframe_points.add(total)
                co = []
                for i in range(total):
                    co += [f0 + i, vals[i][k]]
                fc.keyframe_points.foreach_set('co', co)
                for kp in fc.keyframe_points:
                    kp.interpolation = 'LINEAR'
                fc.update()
    arm.animation_data_create()
    arm.animation_data.action = accion
    escena.frame_start, escena.frame_end = f0, f1
    escena.frame_set(f0)
    pel = arm.matrix_world @ arm.pose.bones['Bip01 Pelvis'].head
    print('PELVIS_INICIO', [round(x, 4) for x in pel])
    exportar(cfg['salida'], True)


{'avatar': avatar, 'clip': clip}[cfg['modo']]()
print('LISTO', cfg['salida'])
