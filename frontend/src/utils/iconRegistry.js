import * as FaIcons from 'react-icons/fa';
import * as MdIcons from 'react-icons/md';
import * as IoIcons from 'react-icons/io5';
import * as BiIcons from 'react-icons/bi';
import * as AiIcons from 'react-icons/ai';
import * as GiIcons from 'react-icons/gi';
import * as FiIcons from 'react-icons/fi';
import * as TbIcons from 'react-icons/tb';

export const allReactIcons = {
  ...Object.fromEntries(Object.entries(FaIcons).filter(([k]) => k.startsWith('Fa'))),
  ...Object.fromEntries(Object.entries(MdIcons).filter(([k]) => k.startsWith('Md'))),
  ...Object.fromEntries(Object.entries(IoIcons).filter(([k]) => k.startsWith('Io'))),
  ...Object.fromEntries(Object.entries(BiIcons).filter(([k]) => k.startsWith('Bi'))),
  ...Object.fromEntries(Object.entries(AiIcons).filter(([k]) => k.startsWith('Ai'))),
  ...Object.fromEntries(Object.entries(GiIcons).filter(([k]) => k.startsWith('Gi'))),
  ...Object.fromEntries(Object.entries(FiIcons).filter(([k]) => k.startsWith('Fi'))),
  ...Object.fromEntries(Object.entries(TbIcons).filter(([k]) => k.startsWith('Tb'))),
};

export const reactIconNames = Object.keys(allReactIcons);

export const POPULAR_ICONS = [
  'FaHome', 'FaBook', 'FaUser', 'FaCog', 'FaHeart', 'FaStar', 'FaFolder', 'FaFile',
  'FaImage', 'FaCamera', 'FaMusic', 'FaVideo', 'FaCar', 'FaPlane', 'FaTree', 'FaLeaf',
  'FaBed', 'FaCouch', 'FaTv', 'FaUtensils', 'FaCoffee', 'FaGift', 'FaShoppingCart', 'FaCreditCard',
  'FaTruck', 'FaBox', 'FaWarehouse', 'FaIndustry', 'FaTools', 'FaLaptop', 'FaMicrochip', 'FaMemory',
  'MdHome', 'MdWork', 'MdSchool', 'MdFavorite', 'MdInventory', 'MdLocalShipping', 'MdFactory',
  'BiHome', 'BiBook', 'BiPackage', 'IoHome', 'IoBook', 'IoBuild',
];

export function getIcon(name) {
  if (!name) return null;
  return allReactIcons[name] || null;
}
