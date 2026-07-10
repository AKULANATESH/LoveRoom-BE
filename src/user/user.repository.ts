import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { AddUserDto } from './user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AddUserDto): Promise<User> {
    const usernameBase = user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
    const newUser = await this.prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        age: user.age,
        username: `${usernameBase}_${Date.now()}`,
        passwordHash: 'legacy-user-no-password',
      },
    });
    return newUser;
  }

  async find(filter: Partial<User>): Promise<User[]> {
    return await this.prisma.user.findMany({
      where: filter, // Prisma's way of applying filters
    });
  }

  async findById(id: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, user: Partial<Omit<User, 'id'>>): Promise<User> {
    return await this.prisma.user.update({
      where: { id },
      data: user,
    });
  }

  async delete(id: string): Promise<string> {
    await this.prisma.user.delete({
      where: { id },
    });
    return `User with ID ${id} deleted`;
  }

  async findAll(query?: string): Promise<User[]> {
    if (query) {
      const searchRegex = new RegExp(query, 'i');
      return await this.prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: searchRegex.source } }, // Use `contains` for case-insensitive search
            { email: { contains: searchRegex.source } },
          ],
        },
      });
    }

    return await this.prisma.user.findMany();
  }
}
// import { InjectModel } from '@nestjs/mongoose';
// import { FilterQuery, Model } from 'mongoose';
// import { Injectable } from '@nestjs/common';
// import { User } from './user.schema';
// import { AddUserDto } from './user.dto';

// @Injectable()
// export class UserRepository {
//   constructor(@InjectModel(User.name) private userModel: Model<User>) {}

//   async create(user: AddUserDto): Promise<User> {
//     const newUser = await this.userModel.create(user);
//     return newUser;
//   }

//   async find(user: AddUserDto): Promise<User[]> {
//     return await this.userModel.find({ user });
//   }

//   async findById(_id: string): Promise<User> {
//     return await this.userModel.findById({ _id });
//   }

//   async findByEmail(email: string): Promise<User> {
//     return await this.userModel.findOne({ email });
//   }

//   async update(id: string, user: Partial<Omit<User, '_id'>>): Promise<User> {
//     return await this.userModel.findByIdAndUpdate(id, user, { new: true });
//   }

//   async delete(id: string): Promise<string> {
//     await this.userModel.findByIdAndDelete(id);
//     return `User with ID ${id} deleted`;
//   }

//   async findAll(filter?: FilterQuery<Document>): Promise<User[]> {
//     // Assume you have a User model from Mongoose
//     return await this.userModel.find(filter);
//   }
// }
