"""Author the Coffee Run toy-office environment and chair assets with Blender 4.0 or newer.

Run: blender --background --python scripts/build-assets.py
System Blender packages require numpy: python3 -m pip install --user 'numpy<2'.
Game coordinates are X/right, Y/up, Z/forward. Blender coordinates are X, -Z, Y.
"""
import bpy
import math
import os
import json
import subprocess
import site
from mathutils import Vector

# Distribution Blender may omit the user's Python packages from its search path.
site.addsitedir(site.getusersitepackages())
import numpy as np

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'assets'))
os.makedirs(OUT, exist_ok=True)


def clean():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.actions):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)



def texture_kind(name):
    if name in ('Honey oak','Oak surface'): return 'wood'
    if name=='Uniform' or 'jacket' in name: return 'fabric'
    if 'tile' in name.lower(): return 'tile'
    if 'Sage' in name or name=='Forest edging': return 'paint'
    if name in ('Porcelain','Terracotta enamel','Salmon detail'): return 'ceramic'
    if name=='Warm ivory enamel': return 'plaster'
    return None


def attach_textures(mat,kind,color,roughness):
    size=256
    axis=np.arange(size,dtype=np.float32)/size
    u,v=np.meshgrid(axis,axis)
    seed=sum((i+1)*ord(c) for i,c in enumerate(kind))
    rng=np.random.default_rng(seed)
    noise=np.zeros((size,size),dtype=np.float32)
    for frequency,amplitude in [(1,.38),(2,.22),(4,.14),(8,.09),(16,.05),(32,.03)]:
        for _ in range(3):
            fx=int(rng.integers(1,frequency+1));fy=int(rng.integers(1,frequency+1))
            noise+=amplitude/3*np.sin(2*math.pi*(fx*u+fy*v)+rng.uniform(0,2*math.pi))
    grit=rng.random((size,size),dtype=np.float32)-.5
    if kind=='wood':
        warp=.016*np.sin(2*math.pi*v*2)+.006*np.sin(2*math.pi*v*5)+.008*noise
        fu=np.fft.fftfreq(size)[None,:];fv=np.fft.fftfreq(size)[:,None]
        fibers=np.fft.ifft2(np.fft.fft2(rng.standard_normal((size,size)))*
                           np.exp(-2*math.pi**2*((fu*1.0)**2+(fv*17)**2))).real
        fibers/=max(.001,float(fibers.std()))
        grain=.72*fibers+.17*np.sin(2*math.pi*(u+warp)*79)+.08*np.sin(2*math.pi*(u+warp)*113)
        du=(u-.37+.5)%1-.5;dv=(v-.64+.5)%1-.5
        radius=np.sqrt((du*.85)**2+(dv*.24)**2)
        knot=np.sin(radius*650+warp*20)*np.exp(-((du/.065)**2+(dv/.16)**2))
        shade=.10*noise+.035*grain+.022*knot+.005*grit
        height=.15*grain+.18*noise+.08*knot
        rough=roughness+.10*noise+.04*grain
    elif kind=='fabric':
        weave=np.sin(2*math.pi*u*48)*np.sin(2*math.pi*v*48)
        shade=.032*weave+.045*noise+.006*grit
        height=.28*weave+.08*noise
        rough=.86+.04*weave+.05*noise
    elif kind=='tile':
        scuff=np.zeros_like(noise)
        for _ in range(18):
            cx,cy=rng.random(2);du=(u-cx+.5)%1-.5;dv=(v-cy+.5)%1-.5
            rx,ry=rng.uniform(.015,.08),rng.uniform(.002,.012)
            scuff+=np.exp(-((du/rx)**2+(dv/ry)**2))*rng.uniform(.04,.13)
        shade=.15*noise+.018*grit-scuff
        height=.18*noise-.4*scuff
        rough=roughness+.17*noise+scuff
    elif kind=='paint':
        shade=.10*noise+.014*grit
        height=.16*noise+.08*grit
        rough=roughness+.10*noise+.05*grit
    elif kind=='ceramic':
        fleck=np.maximum(0,grit-.475)*20
        shade=.045*noise-.025*fleck
        height=.06*noise+.015*grit
        rough=roughness+.055*noise+.02*fleck
    else:
        shade=.10*noise+.025*grit
        height=.18*noise+.11*grit
        rough=.85+.08*noise
    linear=np.clip(np.asarray(color,dtype=np.float32)[None,None,:]*(1+shade[:,:,None]),0,1)
    srgb=np.where(linear<=.0031308,12.92*linear,1.055*np.power(linear,1/2.4)-.055)
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*.28
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*.28
    normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    normal=normal*.5+.5
    channels={'base':srgb,'roughness':np.repeat(np.clip(rough,.12,.98)[:,:,None],3,axis=2),'normal':normal}
    folder=os.path.join(OUT,'textures');os.makedirs(folder,exist_ok=True)
    slug=''.join(c.lower() if c.isalnum() else '-' for c in mat.name)
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;shader=nodes.get('Principled BSDF')
    for channel,pixels in channels.items():
        image=bpy.data.images.new(slug+'-'+channel,width=size,height=size,alpha=False)
        image.colorspace_settings.name='sRGB' if channel=='base' else 'Non-Color'
        rgba=np.ones((size,size,4),dtype=np.float32);rgba[:,:,:3]=pixels
        image.pixels.foreach_set(rgba.ravel())
        image.filepath_raw=os.path.join(folder,slug+'-'+channel+'.png');image.file_format='PNG';image.save()
        node=nodes.new('ShaderNodeTexImage');node.image=image;node.interpolation='Linear';node.extension='REPEAT'
        if channel=='base':
            shader.inputs['Base Color'].default_value=(1,1,1,1)
            links.new(node.outputs['Color'],shader.inputs['Base Color'])
        elif channel=='roughness': links.new(node.outputs['Color'],shader.inputs['Roughness'])
        else:
            normal_node=nodes.new('ShaderNodeNormalMap');normal_node.inputs['Strength'].default_value=.6
            links.new(node.outputs['Color'],normal_node.inputs['Color']);links.new(normal_node.outputs['Normal'],shader.inputs['Normal'])
    mat['texture_family']=kind


def project_texture_uvs():
    bpy.context.view_layer.update()
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH' or not obj.data.materials: continue
        mat=obj.data.materials[0]
        kind=mat.get('texture_family')
        if not kind: continue
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='Authored surface UV')
        scale=.65 if kind=='wood' else 1.0
        transform=obj.matrix_world
        for poly in obj.data.polygons:
            normal=transform.to_3x3()@poly.normal
            major=max(range(3),key=lambda i:abs(normal[i]))
            axes=(0,1) if major==2 else ((0,2) if major==1 else (1,2))
            if kind=='wood' and ('worktop' in obj.name.lower() or 'table' in obj.name.lower()): axes=tuple(reversed(axes))
            for index in poly.loop_indices:
                point=transform@obj.data.vertices[obj.data.loops[index].vertex_index].co
                uv.data[index].uv=(point[axes[0]]*scale,point[axes[1]]*scale)

def material(name, color, roughness=.65, metal=0):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    kind=texture_kind(name)
    if kind: attach_textures(mat,kind,color,roughness)
    return mat


M = {
    'cream': material('Warm ivory enamel', (.88, .83, .68)),
    'white': material('Porcelain', (.96, .96, .88), .28),
    'sage': material('Sage cabinet enamel', (.13, .34, .23)),
    'sageLight': material('Sage inset panels', (.24, .48, .32)),
    'forest': material('Forest edging', (.035, .105, .075)),
    'wood': material('Honey oak', (.43, .20, .065)),
    'woodLight': material('Oak surface', (.66, .39, .14)),
    'terra': material('Terracotta enamel', (.73, .16, .065)),
    'pink': material('Salmon detail', (.87, .48, .34)),
    'brass': material('Brushed brass', (.71, .48, .19), .31, .55),
    'steel': material('Satin steel', (.38, .43, .40), .27, .68),
    'dark': material('Charcoal rubber', (.065, .09, .08)),
    'coffee': material('Coffee', (.12, .045, .016), .2),
    'leaf': material('Leaf', (.19, .40, .22)),
    'leafLight': material('Young leaves', (.43, .62, .24)),
    'soil': material('Potting earth', (.15, .085, .037)),
    'paper': material('Paper', (.98, .91, .72)),
    'tile': material('Cream tile', (.61, .64, .47)),
    'tileAlt': material('Alternating cream tile', (.48, .56, .39)),
    'grout': material('Tile grout', (.20, .29, .20)),
    'blue': material('Monitor glass', (.14, .30, .33), .28),
}


def finish(obj, name, mat, parent=None):
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def box(name, loc, size, mat, bevel=.06, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
        mod.width = min(bevel, min(size) * .45)
        detail = name.lower()
        flat_detail = any(word in detail for word in ('tile', 'plank', 'label', 'paper', 'stripe', 'ink line'))
        peripheral_detail = detail.startswith('peripheral') or detail.startswith('sealed coffee') or detail.startswith('supply box')
        mod.segments = 1 if flat_detail or peripheral_detail else 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for poly in obj.data.polygons:
            poly.use_smooth = True
        if hasattr(obj.data, 'use_auto_smooth'):
            obj.data.use_auto_smooth = True
        mod = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, mat, parent)


def sphere(name, loc, size, mat, parent=None):
    leaf = name == 'Wax leaf'
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8 if leaf else 16,
                                        ring_count=6 if leaf else 10,
                                        radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return finish(obj, name, mat, parent)


def cyl(name, loc, radius, depth, mat, parent=None, vertices=24):
    stem = name == 'Plant stem'
    if stem:
        vertices = 6
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    mod = obj.modifiers.new('Rounded rims', 'BEVEL')
    mod.width = min(.025, radius * .18, depth * .2)
    mod.segments = 1 if stem else 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return finish(obj, name, mat, parent)


def torus(name, loc, major, minor, mat, parent=None, rot=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                    major_segments=24, minor_segments=8, location=loc)
    obj = bpy.context.object
    if rot:
        obj.rotation_euler = rot
    for p in obj.data.polygons:
        p.use_smooth = True
    return finish(obj, name, mat, parent)


def empty(name, loc=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.parent = parent
    return obj


def beam(name, a, b, width, mat, parent=None):
    middle = (Vector(a) + Vector(b)) / 2
    obj = cyl(name, middle, width, (Vector(b) - Vector(a)).length, mat, parent, 12)
    obj.rotation_euler = (Vector(b) - Vector(a)).to_track_quat('Z', 'Y').to_euler()
    return obj


def label(text, loc, size, mat, rotation=(math.pi/2, 0, 0)):
    bpy.ops.object.text_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = 'Lettering ' + text
    obj.data.body = text
    obj.data.size = size
    obj.data.align_x = 'CENTER'
    obj.data.extrude = .002
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def export(name, animations=False):
    bpy.ops.object.select_all(action='SELECT')
    pending = os.path.join(OUT, name + '.next.glb')
    bpy.ops.export_scene.gltf(filepath=pending,
                              export_format='GLB', use_selection=True,
                              export_animations=animations, export_nla_strips=True,
                              export_force_sampling=True, export_frame_range=False,
                              export_cameras=False, export_lights=False,
                              export_yup=True, export_extras=True)
    os.replace(pending, os.path.join(OUT, name + '.glb'))


def combine_static():
    project_texture_uvs()
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and not obj.animation_data:
            key = obj.data.materials[0].name if obj.data.materials else 'unassigned'
            groups.setdefault(key, []).append(obj)
    for name, objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = name


def combine_articulated():
    project_texture_uvs()
    groups = {}
    bpy.context.view_layer.update()
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj.parent and obj.data.materials:
            key = (obj.parent, obj.data.materials[0])
            groups.setdefault(key, []).append(obj)
    for (parent, mat), objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = mat.name + '_' + parent.name


def make_chair(export_file=True, origin=(0, 0, 0)):
    if export_file:
        clean()
    x, y, z = origin
    root = empty('Chair')
    root.location = origin
    box('Padded seat', (0, 0, .55), (.70, .66, .16), M['sage'], .10, root)
    box('Upholstered back', (0, .28, .89), (.70, .15, .58), M['sage'], .09, root)
    box('Back piping', (0, .375, .89), (.59, .025, .44), M['sageLight'], .035, root)
    cyl('Gas lift', (0, 0, .31), .065, .40, M['steel'], root)
    for angle in [i*2*math.pi/5 for i in range(5)]:
        end = (.37*math.cos(angle), .37*math.sin(angle), .12)
        beam('Caster spoke', (0, 0, .18), end, .035, M['steel'], root)
        wheel = cyl('Rubber caster', (end[0], end[1], .075), .067, .075, M['dark'], root, 16)
        wheel.rotation_euler.x = math.pi/2
    for side in [-1, 1]:
        beam('Armrest upright', (side*.36, .1, .58), (side*.36, .1, .79), .025, M['steel'], root)
        box('Armrest pad', (side*.36, 0, .79), (.09, .39, .065), M['dark'], .03, root)
    if export_file:
        combine_articulated()
        export('chair')
    return root


def plant(x,z,y,scale=1):
    p=(x,-z,y)
    pot=cyl('Terracotta planter',(p[0],p[1],p[2]+.18*scale),.22*scale,.36*scale,M['terra'])
    torus('Pot rolled rim',(p[0],p[1],p[2]+.34*scale),.22*scale,.035*scale,M['pink'])
    cyl('Visible soil',(p[0],p[1],p[2]+.35*scale),.19*scale,.02,M['soil'])
    for i in range(7):
        a=i*2.4
        top=(p[0]+math.cos(a)*.27*scale,p[1]+math.sin(a)*.27*scale,p[2]+(.61+.12*(i%3))*scale)
        beam('Plant stem',(p[0],p[1],p[2]+.34*scale),top,.016*scale,M['leaf'])
        leaf=sphere('Wax leaf',top,(.14*scale,.055*scale,.23*scale),M['leafLight'] if i%3==0 else M['leaf'])
        leaf.rotation_euler=(.40*math.sin(a),.6*math.cos(a),a)


def counter(name,x,z,w,d,h):
    box(name+' plinth',(x,-z,.085),(w-.12,d-.10,.17),M['forest'],.045)
    box(name+' cabinet',(x,-z,h*.48),(w-.06,d-.06,h-.12),M['sage'],.075)
    box(name+' oak worktop',(x,-z,h-.09),(w+.03,d+.03,.18),M['woodLight'],.075)
    box(name+' cream counter edge',(x,-z,h-.18),(w+.015,d+.015,.035),M['cream'],.012)
    count=max(1,round(w/.92))
    for i in range(count):
        sx=x-w/2+(i+.5)*w/count
        box(name+' door',(sx,-z-d/2-.015,h*.47),(w/count-.065,.045,h-.30),M['sageLight'],.025)
        box(name+' brass handle',(sx,-z-d/2-.05,h*.70),(.23,.045,.035),M['brass'],.013)


def machine(x,z):
    # Machine front faces the kitchen approach (+game Z).
    y=-z
    base=1.08
    box('Espresso tray',(x,y-.05,base+.06),(1.30,.68,.10),M['steel'],.035)
    box('Terracotta espresso body',(x,y+.17,base+.44),(1.23,.48,.78),M['terra'],.12)
    box('Ivory control face',(x,y-.095,base+.58),(1.04,.035,.32),M['cream'],.045)
    box('Coffee group',(x,y-.20,base+.64),(.32,.28,.20),M['steel'],.035)
    cyl('Group spout',(x,y-.28,base+.50),.04,.14,M['steel'])
    for sx in [-.35,.35]:
        dial=cyl('Espresso pressure dial',(x+sx,y-.127,base+.61),.09,.025,M['white'])
        dial.rotation_euler.x=math.pi/2
        box('Dial pointer',(x+sx,y-.148,base+.63),(.014,.01,.08),M['terra'],.005)
    for i in range(7):
        box('Drain tray slot',(x-.45+i*.15,y-.1,base+.118),(.035,.42,.009),M['dark'],.004)
    beam('Steam wand',(x+.48,y-.11,base+.40),(x+.53,y-.31,base+.20),.025,M['steel'])
    box('Cup warming rack',(x,y+.15,base+.87),(1.10,.43,.06),M['steel'],.025)
    for sx in [-.34,.34]:
        cyl('Warming cup',(x+sx,y+.15,base+.98),.095,.17,M['white'])
        torus('Warming cup handle',(x+sx+.11,y+.15,base+1.0),.05,.015,M['white'],rot=(math.pi/2,0,0))


def customer(x=7,z=-2.3):
    y=-z
    skin=material('Customer warm skin',(.79,.52,.32))
    suit=material('Customer teal jacket',(.055,.21,.21))
    hair=material('Customer silver hair',(.56,.61,.53))
    box('Customer seat',(x,y,.55),(.80,.67,.16),M['forest'],.10)
    box('Customer chair back',(x,y+.23,1.0),(.85,.19,.79),M['forest'],.10)
    sphere('Customer rounded jacket',(x,y,.99),(.39,.28,.39),suit)
    sphere('Customer ivory shirt',(x,y-.245,1.09),(.13,.045,.26),M['cream'])
    for side in [-1,1]:
        sphere('Customer bow tie',(x+side*.065,y-.29,1.25),(.085,.035,.06),M['terra'])
    cyl('Customer neck',(x,y,1.34),.13,.16,skin)
    sphere('Customer expressive face',(x,y,1.64),(.405,.325,.375),skin)
    sphere('Customer chin',(x,y-.025,1.43),(.28,.25,.18),skin)
    sphere('Customer silver crown',(x,y+.08,1.94),(.40,.29,.14),hair)
    for side in [-1,1]:
        sphere('Customer side hair',(x+side*.34,y+.09,1.78),(.10,.25,.20),hair)
        sphere('Customer ear',(x+side*.395,y,1.59),(.07,.07,.11),skin)
        sphere('Customer eye white',(x+side*.15,y-.30,1.69),(.085,.04,.10),M['white'])
        sphere('Customer pupil',(x+side*.145,y-.337,1.68),(.043,.021,.062),M['dark'])
        sphere('Customer brow',(x+side*.15,y-.295,1.82),(.12,.035,.035),hair)
        beam('Customer forearm',(x+side*.30,y-.08,1.13),(x+side*.38,y-.54,1.19),.115,suit)
        sphere('Customer hand',(x+side*.38,y-.57,1.19),(.13,.15,.10),skin)
        sphere('Customer thigh',(x+side*.18,y-.24,.62),(.16,.34,.15),M['forest'])
        sphere('Customer shin',(x+side*.18,y-.49,.36),(.14,.15,.28),M['forest'])
        sphere('Customer shoes',(x+side*.18,y-.58,.13),(.18,.25,.11),M['dark'])
    sphere('Customer nose',(x,y-.36,1.58),(.085,.10,.085),skin)
    sphere('Customer waiting mouth',(x,y-.305,1.43),(.07,.025,.028),M['dark'])
    cyl('Customer wristwatch',(x+.39,y-.48,1.29),.075,.025,M['brass'])


def office_table(o):
    x,z,w,d,h=[o[k] for k in ('x','z','w','d','h')]
    for side in [-1,1]:
        for depth in [-1,1]:
            box('Communal oak table leg',(x+side*(w/2-.22),-z+depth*(d/2-.22),h/2-.06),(.18,.18,h-.12),M['forest'],.065)
    box('Communal rounded oak table',(x,-z,h-.10),(w,d,.20),M['woodLight'],.09)
    box('Communal table inlay',(x,-z,h-.004),(w-.18,.045,.008),M['wood'],.002)
    box('Shared table felt mat',(x,-z,h+.015),(1.10,.72,.03),M['sage'],.055)
    box('Closed office notebook',(x-w*.30,-z-.36,h+.05),(.48,.57,.08),M['terra'],.03)
    box('Notebook pages',(x-w*.30,-z-.35,h+.048),(.44,.53,.045),M['paper'],.015)
    box('Notebook cover',(x-w*.30,-z-.35,h+.10),(.48,.57,.02),M['terra'],.015)
    beam('Table pencil',(x+.65,-z+.40,h+.04),(x+.97,-z+.31,h+.04),.023,M['brass'])


def copier(o):
    x,z,w,d,h=[o[k] for k in ('x','z','w','d','h')]
    box('Copier charcoal plinth',(x,-z,.10),(w-.12,d-.10,.20),M['dark'],.065)
    box('Copier ivory body',(x,-z,.57),(w-.05,d-.04,.91),M['cream'],.11)
    for height in [.30,.59]:
        box('Copier paper drawer',(x,-z-d/2-.008,height),(w-.20,.035,.24),M['sageLight'],.035)
        box('Copier drawer handle',(x,-z-d/2-.04,height+.05),(.45,.06,.045),M['forest'],.018)
    box('Copier scanner glass',(x,-z,h-.13),(w-.15,d-.15,.08),M['blue'],.04)
    box('Copier thick scanner lid',(x,-z+.10,h-.05),(w-.03,d-.24,.10),M['sage'],.055)
    box('Copier control panel',(x,-z-d/2+.08,.94),(w-.17,.30,.12),M['forest'],.035)
    box('Copier blue display',(x-.20,-z-d/2+.08,1.008),(.40,.17,.012),M['blue'],.01)
    for i in range(3):
        cyl('Copier chunky button',(x+.17+i*.11,-z-d/2+.08,1.015),.036,.015,M['terra'] if i==2 else M['cream'])
    box('Copier output slot',(x,-z-d/2-.04,.78),(w-.30,.06,.12),M['dark'],.03)
    box('Copier fresh paper',(x-.08,-z-d/2-.055,.80),(.66,.05,.025),M['white'],.006)
    label('COPY',(x,-z-d/2-.047,.43),.11,M['forest'])


def environment():
    clean()
    repo=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
    level=json.loads(subprocess.check_output(['node','--input-type=module','-e',
        "import { LEVEL } from './shared/level.js'; console.log(JSON.stringify(LEVEL))"],cwd=repo))
    print('Building environment: shared geometry and continuous office floor',flush=True)
    obstacles={o['id']:o for o in level['obstacles']}
    bounds=level['bounds']
    minx,maxx,minz,maxz=[bounds[k] for k in ('minX','maxX','minZ','maxZ')]
    width,depth=maxx-minx,maxz-minz
    # The painted building foundation and exterior service verge frame a real place.
    exterior=material('Exterior slate paving',(.11,.17,.16))
    brick=material('Painted foundation brick',(.17,.25,.20))
    glass=material('Window petrol glass',(.055,.18,.23),.20)
    sky=material('Window sky reflection',(.20,.43,.47),.25)
    peripheral=material('Peripheral floor tile',(.23,.28,.21),.82)
    box('Continuous office building floor',(0,0,-.13),(120,100,.24),peripheral,.02)
    box('South office corridor inlay',(0,-9,-.018),(36,4.2,.012),M['wood'],.005)
    box('North service corridor inlay',(0,9,-.018),(36,4.2,.012),peripheral,.005)
    # Cropped neighboring office storage makes the arena part of a larger building.
    for x in [-13.7,13.7]:
        box('Outer building wall',(x,0,1.2),(.35,25,2.4),M['cream'],.08)
        box('Outer building skirting',(x,0,.22),(.42,25,.44),M['sage'],.035)
    box('Far office plaster wall',(0,11.6,1.30),(28,.28,2.6),M['cream'],.07)
    for x in [-11,-7,-3,1,5,9,13]:
        box('Far wall timber framing',(x,11.39,1.30),(.16,.12,2.6),M['wood'],.035)
    for x in [-11.7,11.7]:
        for z in [-5.0,-1.0,3.0,7.8]:
            counter('Peripheral filing cupboard',x,z,1.75,1.5,1.20)
            for n in range(4):
                box('Peripheral archive binder',(x-.52+n*.31,-z+.16,1.44),(.22,.54,.46),[M['sage'],M['terra'],M['blue']][n%3],.025)
                box('Peripheral binder label',(x-.52+n*.31,-z-.119,1.47),(.13,.015,.16),M['paper'],.005)
    counter('South corridor coffee supply',-6.1,8.3,5.6,1.30,.88)
    counter('South corridor archive',6.2,8.3,5.6,1.30,.88)
    for x in [-8.3,-6.8,5.1,7.5]:
        plant(x,8.3,.89,.85)
    for x in [-4.7,-3.8,4.3]:
        box('Sealed coffee bean supply box',(x,-8.3,1.13),(.65,.70,.50),M['wood'],.045)
        box('Supply box paper band',(x,-8.3,1.39),(.20,.69,.015),M['paper'],.004)
    # Tile and plank tops agree with Rapier's Y=0 contact plane.
    box('Kitchen dark grout',(-4.7,0,-.045),(10,depth,.08),M['grout'],.02)
    box('Office dark underfloor',(5,0,-.045),(9.2,depth,.08),M['wood'],.02)
    for ix in range(10):
        for iz in range(14):
            tile=box('Hand-set kitchen tile',(-9.09+ix*.98,-6.13+iz*.94,-.022),(.945,.905,.04),M['tileAlt'] if (ix+iz)%3==0 else M['tile'],.018)
            tile.rotation_euler.z=.004*math.sin(ix*5+iz*7)
    for ix in range(9):
        for iz in range(6):
            y=-5.5+iz*2.2
            plank=box('Wide office oak plank',(.95+ix*.98,y,-.022),(.95,2.165,.04),M['woodLight'] if (ix*3+iz)%5==0 else M['wood'],.012)
    print('Building environment: walls and windows',flush=True)
    # Low cutaway walls, stout framing, and windows enrich the perimeter.
    box('Back ivory plaster wall',(0,-minz+.13,1.04),(width+.35,.26,2.08),M['cream'],.08)
    box('Left cutaway plaster wall',(minx-.13,0,.48),(.26,depth+.3,.96),M['cream'],.08)
    box('Right cutaway wall',(maxx+.13,0,.23),(.26,depth+.3,.46),M['sage'],.07)
    box('Back dark wainscot',(0,-minz+.018,.34),(width,.065,.68),M['sage'],.025)
    box('Back oak dado',(0,-minz-.01,.73),(width+.05,.13,.09),M['woodLight'],.035)
    box('Left oak wall cap',(minx-.13,0,.98),(.37,depth+.3,.12),M['woodLight'],.05)
    for x in [-9.05,-4.25,.7,7.6,9.05]:
        box('Back wall frame post',(x,-minz+.05,1.12),(.18,.11,2.15),M['wood'],.045)
    for x in [3.65,5.65]:
        box('Oak window surround',(x,-minz+.035,1.50),(1.83,.12,1.18),M['wood'],.055)
        box('Deep petrol window',(x,-minz-.035,1.50),(1.64,.055,1.01),glass,.03)
        for dx in [-.38,.38]:
            box('Reflected window sky',(x+dx,-minz-.069,1.65),(.69,.012,.59),sky,.015)
        box('Window mullion',(x,-minz-.09,1.50),(.065,.05,1.0),M['cream'],.018)
        box('Window transom',(x,-minz-.09,1.50),(1.65,.05,.065),M['cream'],.018)
        box('Window oak sill',(x,-minz-.15,.93),(2.0,.33,.12),M['woodLight'],.05)
    # Service crates sit outside the walkable collision boundary.
    for z in [-4.6,-3.45]:
        box('Coffee bean delivery crate',(minx-.83,-z,-.04),(.86,.93,.74),M['wood'],.07)
        for h in [-.26,-.04,.18]:
            box('Crate slat',(minx-.385,-z,h),(.035,.85,.16),M['woodLight'],.02)
        box('Crate coffee label',(minx-.36,-z,.0),(.02,.48,.31),M['paper'],.015)
    print('Building environment: kitchen, shared work surfaces, and office furniture',flush=True)
    # Shared kitchen workstations use the collision footprints directly.
    for identity in ['brew-counter','cup-counter','island','prep-island']:
        if identity in obstacles:
            o=obstacles[identity]
            counter(identity,o['x'],o['z'],o['w'],o['d'],o['h'])
    for station in level['stations']:
        machine(station['cupX'],station['cupZ']-.39)
    brew=obstacles['brew-counter']
    label('COFFEE / SHARED',(brew['x'],-minz-.015,1.68),.28,M['forest'])
    rack=obstacles['cup-counter'];rx,rz=rack['x'],-rack['z']
    box('Open cup rack base',(rx,rz-.20,1.14),(rack['w']-.70,.75,.12),M['cream'],.05)
    for dx in [-1.60,-.53,.53,1.60]:
        box('Cup rack thick divider',(rx+dx,rz-.39,1.40),(.10,.59,.54),M['sage'],.04)
    box('Cup rack oak canopy',(rx,rz-.39,1.70),(3.38,.64,.12),M['woodLight'],.05)
    for dx in [-1.34,-.95,-.28,.13,.80,1.20]:
        for height in [1.25,1.42]:
            cyl('Stacked clean cup',(rx+dx,rz-.39,height),.13,.16,M['white'])
            torus('Cup stack handle',(rx+dx+.14,rz-.39,height+.01),.06,.019,M['terra'],rot=(math.pi/2,0,0))
    cyl('Spoon crock',(rx+1.85,rz+.36,1.27),.15,.37,M['terra'])
    for i in range(4):
        beam('Wooden coffee stirrer',(rx+1.76+i*.055,rz+.36,1.34),(rx+1.73+i*.075,rz+.34,1.70),.017,M['woodLight'])
    island=obstacles['island'];ix,iy=island['x'],-island['z']
    box('Island oak preparation board',(ix-.48,iy+.45,1.12),(.85,.83,.08),M['wood'],.065)
    box('Folded barista cloth',(ix+.63,iy-.37,1.14),(.58,.61,.12),M['cream'],.06)
    for offset in [-.17,-.03,.11]:
        box('Woven cloth stripe',(ix+.63,iy-.37+offset,1.205),(.55,.036,.009),M['terra'],.003)
    cyl('Coffee bean jar',(ix-.80,iy-.46,1.34),.19,.48,M['cream'])
    cyl('Jar wooden lid',(ix-.80,iy-.46,1.60),.21,.065,M['wood'])
    if 'prep-island' in obstacles:
        o=obstacles['prep-island'];x,y=o['x'],-o['z']
        box('Preparation felt drying mat',(x,y,o['h']+.015),(o['w']-.30,o['d']-.25,.03),M['forest'],.07)
        box('Preparation cloth stack',(x-.45,y+.10,o['h']+.08),(.45,.55,.13),M['cream'],.05)
        cyl('Sugar canister',(x+.45,y+.15,o['h']+.17),.15,.32,M['terra'])
        cyl('Sugar wooden lid',(x+.45,y+.15,o['h']+.34),.165,.04,M['woodLight'])
    for identity in ['partition-north','partition-south']:
        o=obstacles[identity];x,z,w,d,h=[o[k] for k in ('x','z','w','d','h')]
        box(identity,(x,-z,h/2),(w,d,h),M['sage'],.07)
        box(identity+' chunky oak cap',(x,-z,h+.035),(w+.10,d+.08,.12),M['woodLight'],.05)
        for pz in [z-d*.28,z+d*.28]:
            box('Partition recessed panel',(x-.168,-pz,.54),(.025,.70,.62),M['sageLight'],.025)
    gate=level['gate']
    for z in [gate['z']-gate['d']/2-.10,gate['z']+gate['d']/2+.10]:
        cyl('Passage brass hinge post',(gate['x'],-z,.58),.11,1.16,M['brass'])
        sphere('Passage post finial',(gate['x'],-z,1.17),(.14,.14,.14),M['brass'])
    # The communal desk retains a single readable delivery point.
    desk=level['customer']['desk'];x,z,w,d,h=[desk[k] for k in ('x','z','w','d','h')]
    for side in [-1,1]:
        box('Customer desk wide foot',(x+side*(w/2-.30),-z,.47),(.24,d-.24,.94),M['forest'],.075)
    box('Customer desk modesty',(x,-z+d*.40,.61),(w-.55,.12,.74),M['sage'],.055)
    box('Customer oak desk top',(x,-z,h-.09),(w,d,.18),M['woodLight'],.09)
    box('Terracotta delivery tray',(x,-z-d*.43,h+.035),(.98,.65,.07),M['terra'],.09)
    torus('Ivory delivery target',(x,-z-d*.43,h+.078),.23,.023,M['cream'])
    box('Desk paper tray',(x+w*.32,-z+.27,h+.05),(.70,.49,.10),M['forest'],.045)
    box('Customer paperwork',(x+w*.32,-z+.25,h+.11),(.54,.36,.02),M['paper'],.008)
    for i in range(3):
        box('Paper ink line',(x+w*.32,-z+.15+i*.07,h+.124),(.31,.014,.005),M['sage'],.002)
    box('Desk nameplate',(x-w*.30,-z-.30,h+.11),(.69,.13,.22),M['forest'],.035)
    label('ONE COFFEE',(x-w*.30,-z-.372,h+.11),.092,M['cream'])
    customer(level['customer']['x'],level['customer']['z'])
    if 'communal-table' in obstacles: office_table(obstacles['communal-table'])
    if 'office-copier' in obstacles: copier(obstacles['office-copier'])
    if 'north-storage' in obstacles:
        o=obstacles['north-storage'];counter('Office archive',o['x'],o['z'],o['w'],o['d'],o['h'])
        for i in range(5):
            box('Colored archive binder',(o['x']-.48+i*.22,-o['z']+.28,o['h']+.22),(.18,.44,.43),[M['terra'],M['sage'],M['blue']][i%3],.025)
            box('Binder paper label',(o['x']-.48+i*.22,-o['z']+.051,o['h']+.24),(.10,.013,.15),M['paper'],.006)
    shelf=obstacles['plant-shelf'];counter('Window planter shelf',shelf['x'],shelf['z'],shelf['w'],shelf['d'],shelf['h'])
    for offset,scale in [(-1.85,.90),(-.15,1.20),(1.65,.84)]:
        plant(shelf['x']+offset,shelf['z'],shelf['h']+.005,scale)
    for x,text in [(-2.8,'TAKE A BREAK'),(8.20,'COFFEE TIME')]:
        box('Oak framed office graphic',(x,-minz+.025,1.35),(1.24,.10,1.04),M['wood'],.055)
        box('Office graphic paper',(x,-minz-.035,1.35),(1.08,.035,.88),M['paper'],.018)
        label(text,(x,-minz-.059,1.61),.12,M['forest'])
        emblem=cyl('Graphic coffee emblem',(x,-minz-.065,1.28),.21,.018,M['terra']);emblem.rotation_euler.x=math.pi/2
        label('THE DAILY GRIND',(x,-minz-.08,1.02),.082,M['forest'])
    clock=cyl('Office wall clock',(-.60,-minz-.055,1.43),.39,.09,M['forest']);clock.rotation_euler.x=math.pi/2
    dial=cyl('Clock ivory face',(-.60,-minz-.115,1.43),.33,.025,M['cream']);dial.rotation_euler.x=math.pi/2
    beam('Clock minute hand',(-.60,-minz-.14,1.43),(-.60,-minz-.14,1.70),.017,M['forest'])
    beam('Clock hour hand',(-.60,-minz-.15,1.43),(-.80,-minz-.15,1.45),.023,M['forest'])
    print('Building environment: projecting texture UVs and merging material meshes',flush=True)
    combine_static()
    export('environment')


# Character meshes and poses now come directly from the original Three.js factory.
if any(flag in __import__('sys').argv for flag in ('--characters-only', '--portraits-only')):
    raise SystemExit('Mascots are authored in client/mascots.js; see public/assets/README.md.')
if '--environment-only' not in __import__('sys').argv:
    make_chair()
environment()
print('Coffee Run environment and props exported to '+OUT)
